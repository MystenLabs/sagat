// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	createRoute,
	z,
	type OpenAPIHono,
} from '@hono/zod-openapi';

import { getRegisteredAddress } from '../../services/addresses.service';
import {
	errorResponse,
	jsonResponse,
	SuiAddressSchema,
} from '../schemas/common';
import { AddressSchema } from '../schemas/rows';

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
	v1.openapi(getAddress, async (c) => {
		const { address } = c.req.valid('param');
		return c.json(await getRegisteredAddress(address), 200);
	});
