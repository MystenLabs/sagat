// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Schemas shared by every `/v1` route: the error body, the Sui address path
 * parameter, and helpers that keep the response declarations short.
 */

import { z } from '@hono/zod-openapi';

// Every error the API returns has this body (see `appErrorHandler` and the
// validation hook in `../app.ts`).
export const ErrorSchema = z
	.object({
		error: z.string().openapi({
			example: 'Address is not registered in the system.',
		}),
	})
	.openapi('Error');

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

// A normalized Sui address: `0x` and 64 lowercase hex digits.
export const SuiAddressSchema = z
	.string()
	.regex(SUI_ADDRESS, 'Must be a normalized Sui address.')
	.openapi({
		example: `0x${'ab'.repeat(32)}`,
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
