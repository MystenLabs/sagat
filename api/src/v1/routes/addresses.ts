// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	createRoute,
	z,
	type OpenAPIHono,
} from '@hono/zod-openapi';

import {
	getRegisteredAddress,
	registerCallerKeys,
} from '../../services/addresses.service';
import {
	authenticated,
	errorResponse,
	jsonResponse,
	requireAuth,
	SuccessSchema,
	SuiAddressSchema,
	unauthorizedResponse,
} from '../schemas/common';
import { AddressSchema } from '../schemas/rows';

const RegisterAddressesRequestSchema = z
	.object({
		extraPublicKeys: z
			.array(z.string())
			.optional()
			.openapi({
				description:
					'More Sui public keys (base64, with their scheme flag) to register. Keys that fail to parse are skipped.',
			}),
	})
	.openapi('RegisterAddressesRequest');

const registerAddresses = createRoute({
	method: 'post',
	path: '/addresses',
	tags: ['Addresses'],
	summary: 'Register addresses',
	description:
		"Registers the session's keys, and any extra keys passed, so they can be put in a signer set.",
	middleware: [requireAuth] as const,
	security: authenticated,
	request: {
		body: {
			content: {
				'application/json': {
					schema: RegisterAddressesRequestSchema,
				},
			},
		},
	},
	responses: {
		200: jsonResponse(
			SuccessSchema,
			'The keys are registered.',
		),
		400: errorResponse('The body is malformed.'),
		401: unauthorizedResponse,
	},
});

const getAddress = createRoute({
	method: 'get',
	path: '/addresses/{address}',
	tags: ['Addresses'],
	summary: 'Look up a registered address',
	description:
		'The public key registered for a Sui address. An address is registered when its key connects, is passed to the register route, or is put in a signer set.',
	request: {
		params: z.object({ address: SuiAddressSchema }),
	},
	responses: {
		200: jsonResponse(
			AddressSchema,
			'The address and its public key.',
		),
		400: errorResponse(
			'The address is malformed or not registered.',
		),
	},
});

export const mountAddresses = (v1: OpenAPIHono) =>
	v1
		.openapi(registerAddresses, async (c) => {
			const { extraPublicKeys = [] } = c.req.valid('json');
			await registerCallerKeys({
				callerKeys: c.get('publicKeys'),
				extraPublicKeys,
			});
			return c.json({ success: true as const }, 200);
		})
		.openapi(getAddress, async (c) => {
			const { address } = c.req.valid('param');
			return c.json(
				await getRegisteredAddress(address),
				200,
			);
		});
