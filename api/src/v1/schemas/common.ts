// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Schemas shared by every `/v1` route: the error body, the Sui address path
 * parameter, and helpers that keep the response declarations short.
 */

import { z } from '@hono/zod-openapi';
import { isValidSuiAddress } from '@mysten/sui/utils';

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
