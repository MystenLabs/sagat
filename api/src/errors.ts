// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ValidationMessages } from '@mysten/sagat/v1';
import { RpcError } from '@mysten/sui/grpc';
import { DrizzleQueryError } from 'drizzle-orm';
import { type ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DatabaseError } from 'pg';
import { type z } from 'zod';

import { ValidationError } from './validation-error';

export { ValidationError };

export class NotFoundError extends Error {}

export class CommonError extends Error {
	constructor(message: keyof typeof CommonErrors) {
		super();
		this.message = CommonErrors[message];
		this.name = 'CommonError';
	}
}

export class ApiAuthError extends Error {
	constructor(message: keyof typeof AuthErrors) {
		super();
		this.message = AuthErrors[message];
		this.name = 'ApiAuthError';
	}
}

// A `/v1` handler's data that does not match its route's response schema.
export class ResponseSchemaError extends Error {
	constructor(
		readonly route: string,
		readonly issues: z.core.$ZodIssue[],
	) {
		super(`Response schema mismatch on ${route}`);
		this.name = 'ResponseSchemaError';
	}
}

// The alias state an access decision needs could not be read or mirrored.
export class AliasStateUnavailableError extends Error {
	constructor(
		readonly accountAddress: string,
		readonly network: string,
		options?: ErrorOptions,
	) {
		super(
			`The signers of account ${accountAddress} on ${network} could not be checked. Please try again.`,
			options,
		);
		this.name = 'AliasStateUnavailableError';
	}
}

export const toError = (error: unknown) =>
	error instanceof Error ? error : new Error(String(error));

// Postgres gave up waiting for a lock (`lock_not_available`).
export const isLockTimeout = (
	err: unknown,
): err is DrizzleQueryError =>
	err instanceof DrizzleQueryError &&
	err.cause instanceof DatabaseError &&
	err.cause.code === '55P03';

export const AuthErrors = {
	NotAMultisigMember:
		'Proposer is either not a member of the multisig, or has not accepted the invitation to the multisig.',
	AccessDenied:
		'Access denied. You are not a member of this multisig.',
	NotAnAccountSigner:
		'You are not a signer of this account on this network.',
};

export const CommonErrors = {
	InvalidAddress: ValidationMessages.InvalidAddress,
	InvalidSignature: 'Invalid signature for message.',
	InvalidDigest: ValidationMessages.InvalidDigest,
};

// The error handler for the app.
export const appErrorHandler: ErrorHandler = (err, c) => {
	// Responses Hono's own middleware throws, like a 403 or 413.
	if (err instanceof HTTPException)
		return err.getResponse();

	if (err instanceof ValidationError)
		return c.json({ error: err.message }, 400);

	if (err instanceof ApiAuthError)
		return c.json({ error: err.message }, 403);

	if (err instanceof CommonError)
		return c.json({ error: err.message }, 400);

	if (err instanceof RpcError) {
		// eslint-disable-next-line no-console
		console.error(
			`Sui RPC failure (${err.code}): ${err.message}`,
		);
		return c.json(
			{
				error:
					'The Sui network could not be reached. Please try again.',
			},
			502,
		);
	}

	if (err instanceof AliasStateUnavailableError) {
		// eslint-disable-next-line no-console
		console.error(err.message, err.cause);
		return c.json({ error: err.message }, 503);
	}

	if (isLockTimeout(err))
		return c.json(
			{
				error:
					'This account is busy. Please try again in a moment.',
			},
			503,
			{ 'Retry-After': '1' },
		);

	if (err instanceof DrizzleQueryError) {
		const msg = err.cause?.message;
		if (msg?.includes('violates unique constraint')) {
			return c.json(
				{ error: 'Data already exists in the database.' },
				400,
			);
		}
	}

	if (err instanceof NotFoundError)
		return c.json(
			{ error: 'The requested resource was not found.' },
			404,
		);

	if (err instanceof ResponseSchemaError) {
		// eslint-disable-next-line no-console
		console.error(err.message, err.issues);
		return c.json({ error: 'Internal Server Error' }, 500);
	}

	// eslint-disable-next-line no-console
	console.error('Unhandled error:', err);
	return c.json({ error: 'Internal Server Error' }, 500);
};
