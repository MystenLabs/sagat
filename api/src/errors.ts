// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { RpcError } from '@mysten/sui/grpc';
import { DrizzleQueryError } from 'drizzle-orm';
import { type ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DatabaseError } from 'pg';

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

// Generic error for unknown errors
export class ValidationError extends Error {}

export const AuthErrors = {
	NotAMultisigMember:
		'Proposer is either not a member of the multisig, or has not accepted the invitation to the multisig.',
	AccessDenied:
		'Access denied. You are not a member of this multisig.',
};

export const CommonErrors = {
	InvalidAddress:
		'Invalid address. Must be a valid Sui address.',
	InvalidSignature: 'Invalid signature for message.',
	InvalidDigest:
		'The transaction digest provided is invalid.',
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

	if (err instanceof DrizzleQueryError) {
		// lock_not_available
		if (
			err.cause instanceof DatabaseError &&
			err.cause.code === '55P03'
		)
			return c.json(
				{
					error:
						'This account is busy. Please try again in a moment.',
				},
				503,
				{ 'Retry-After': '1' },
			);

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

	// eslint-disable-next-line no-console
	console.error('Unhandled error:', err);
	return c.json({ error: 'Internal Server Error' }, 500);
};
