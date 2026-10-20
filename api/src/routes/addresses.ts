// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Hono, type Context } from 'hono';

import {
	toLegacyMultisigWithMembers,
	type LegacyMultisigWithMembers,
} from '../legacy/serializers';
import {
	getRegisteredAddress,
	registerCallerKeys,
} from '../services/addresses.service';
import {
	authMiddleware,
	type AuthEnv,
} from '../services/auth.service';
import {
	listConnections,
	listInvitations,
} from '../services/multisig.service';

const addressesRouter = new Hono();

/**
 * Register addresses from authenticated JWT context.
 * No signature required - uses JWT authentication.
 */
addressesRouter.post(
	'/',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const { extraPublicKeys } = await c.req
			.json()
			.catch(() => ({ extraPublicKeys: [] }));

		await registerCallerKeys({
			callerKeys: c.get('publicKeys'),
			extraPublicKeys,
		});

		return c.json({ success: true });
	},
);

// Return a list of all accepted multisigs that the JWT has active.
addressesRouter.get(
	'/connections',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const connections = await listConnections({
			callerKeys: c.get('publicKeys'),
		});

		const grouped: Record<
			string,
			LegacyMultisigWithMembers[]
		> = {};
		for (const [publicKey, multisigs] of connections)
			grouped[publicKey] = multisigs.map(
				toLegacyMultisigWithMembers,
			);

		return c.json(grouped);
	},
);

// Get invitations for a specific public key
addressesRouter.get(
	'/invitations/:publicKey',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const { showRejected } = c.req.query();
		const { publicKey } = c.req.param();

		const invitations = await listInvitations({
			publicKey,
			showRejected: showRejected === 'true',
			callerKeys: c.get('publicKeys'),
		});

		return c.json(
			invitations.map(toLegacyMultisigWithMembers),
		);
	},
);

// Get the public key for an address registered in the system.
// IMPORTANT: Keep this route last as it's a catch-all for any /:address pattern
addressesRouter.get('/:address', async (c) => {
	const { address } = c.req.param();

	return c.json(await getRegisteredAddress(address));
});

export default addressesRouter;
