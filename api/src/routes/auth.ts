// Copyright (c) Mysten Labs, Inc.
// Modifications Copyright (c) 2025 IOTA Stiftung
// SPDX-License-Identifier: Apache-2.0

import { Hono, type Context } from 'hono';

import {
	authMiddleware,
	connectForScript,
	connectToPublicKey,
	disconnect,
	type AuthEnv,
} from '../services/auth.service';

const authRouter = new Hono();

authRouter.post('/script-connect', connectForScript);
authRouter.post('/connect', connectToPublicKey);
authRouter.post('/disconnect', disconnect);

// Check auth status - uses middleware and returns user info if authenticated
authRouter.get(
	'/check',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const publicKeys = c.get('publicKeys');

		const addresses = publicKeys.map((pk) => {
			return {
				address: pk.toIotaAddress(),
				publicKey: pk.toIotaPublicKey(),
			};
		});

		return c.json({
			authenticated: true,
			addresses,
		});
	},
);

export default authRouter;
