// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Schemas shared by every `/v1` route: the error body, the Sui address path
 * parameter, and helpers that keep the route declarations short.
 */

import { z } from '@hono/zod-openapi';
import {
	isValidSuiAddress,
	isValidTransactionDigest,
} from '@mysten/sui/utils';
import { type MiddlewareHandler } from 'hono';

import {
	authMiddleware,
	type AuthEnv,
} from '../../services/auth.service';

// Every error the API returns has this body (see `appErrorHandler` and the
// validation hook in `../app.ts`).
export const ErrorSchema = z
	.object({
		error: z.string().openapi({
			example: 'Address is not registered in the system.',
		}),
	})
	.openapi('Error');

// A Sui address, as `isValidSuiAddress` accepts it. Registered as a
// component, so every route that takes one refers to it.
export const SuiAddressSchema = z
	.string()
	.refine(isValidSuiAddress, 'Must be a valid Sui address.')
	.openapi('SuiAddress', {
		description: 'A Sui address.',
		example: `0x${'ab'.repeat(32)}`,
	});

// A Sui public key. Not a component: it is described where it is used.
export const PublicKeySchema = z.string().openapi({
	description:
		'The Sui public key, base64, with its scheme flag.',
	example: 'AJDCUe2/8eIAPvKY5uE9GHnWf1xdNThxNVL94GxOx1Yz',
});

// A transaction digest, as `isValidTransactionDigest` accepts it.
export const TransactionDigestSchema = z
	.string()
	.refine(
		isValidTransactionDigest,
		'Must be a valid transaction digest.',
	)
	.openapi('TransactionDigest', {
		description: 'A Sui transaction digest, base58.',
		example: 'C5xDL4jZ5cDyDqUt1ZwhmB1Mw3vKpA7Y2qTxwZv3Wpv4',
	});

// A Sui network. Responses only list the networks the server supports.
export const NetworkSchema = z
	.enum(['mainnet', 'testnet', 'devnet', 'localnet'])
	.openapi('Network', { example: 'mainnet' });

// A timestamp, as JSON serializes a `Date`.
export const TimestampSchema = z.iso.datetime().openapi({
	example: '2026-10-01T12:00:00.000Z',
});

export const SuccessSchema = z
	.object({ success: z.literal(true) })
	.openapi('Success');

// The session's keys, from the cookie or a script token. Typed so that the
// handlers of routes that use it can read `publicKeys`.
export const requireAuth: MiddlewareHandler<AuthEnv> =
	authMiddleware;

// The security requirement of routes behind `requireAuth`: either scheme.
export const authenticated: Record<string, string[]>[] = [
	{ cookieAuth: [] },
	{ bearerAuth: [] },
];

/** A required JSON request body of the given schema. */
export const jsonBody = <T extends z.ZodType>(
	schema: T,
) => ({
	required: true,
	content: { 'application/json': { schema } },
});

/** A JSON response of the given schema. */
export const jsonResponse = <T extends z.ZodType>(
	schema: T,
	description: string,
) => ({
	description,
	content: { 'application/json': { schema } },
});

/** An error response, with the shared error body. */
export const errorResponse = (description: string) =>
	jsonResponse(ErrorSchema, description);

// `authMiddleware` answers in plain text, shared with the legacy routes.
export const unauthorizedResponse = {
	description: 'No session, or the session has expired.',
	content: {
		'text/plain': {
			schema: z
				.string()
				.openapi({ example: 'Unauthorized' }),
		},
	},
};
