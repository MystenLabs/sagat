// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Hono, type Context } from 'hono';

import {
	toLegacyMultisig,
	toLegacyMultisigMember,
	toLegacyMultisigWithMembers,
} from '../legacy/serializers';
import {
	authMiddleware,
	type AuthEnv,
} from '../services/auth.service';
import {
	acceptInvitation,
	addProposer,
	createSignerSet,
	getMultisigAccount,
	rejectInvitation,
	removeProposer,
	type CreateSignerSetInput,
} from '../services/multisig.service';

const multisigRouter = new Hono();

// Get multisig details by address (authenticated)
multisigRouter.get(
	'/:address',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const { address } = c.req.param();

		const multisig = await getMultisigAccount({
			address,
			callerKeys: c.get('publicKeys'),
		});

		return c.json(toLegacyMultisigWithMembers(multisig));
	},
);

multisigRouter.post(
	'/',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const {
			publicKeys,
			weights,
			threshold,
			name,
			labels,
		}: CreateSignerSetInput = await c.req.json();

		const created = await createSignerSet({
			publicKeys,
			weights,
			threshold,
			name,
			labels,
			callerKeys: c.get('publicKeys'),
		});

		return c.json({
			multisig: toLegacyMultisig(
				created.signerSet,
				created.origin,
			),
			members: created.members.map((member) =>
				toLegacyMultisigMember(
					member,
					created.labels.get(member.publicKey) ?? null,
				),
			),
		});
	},
);

// Accept participation in a multisig scheme as a public key holder.
multisigRouter.post('/:address/accept', async (c) => {
	const { signature } = await c.req.json();
	const { address } = c.req.param();

	const { signerSet, origin } = await acceptInvitation({
		address,
		signature,
	});

	return c.json(toLegacyMultisig(signerSet, origin));
});

// Reject participation in a multisig scheme
multisigRouter.post('/:address/reject', async (c) => {
	const { signature } = await c.req.json();
	const { address } = c.req.param();

	await rejectInvitation({ address, signature });

	return c.json({
		message: 'Multisig invitation rejected and removed',
		address,
	});
});

// Add an external proposer for a multisig address
multisigRouter.post('/:address/add-proposer', async (c) => {
	const { signature, proposer, expiry } =
		await c.req.json();
	const { address } = c.req.param();

	await addProposer({
		address,
		proposer,
		signature,
		expiry,
	});

	return c.json({ success: true });
});

multisigRouter.post(
	'/:address/remove-proposer',
	async (c) => {
		const { signature, proposer, expiry } =
			await c.req.json();
		const { address } = c.req.param();

		await removeProposer({
			address,
			proposer,
			signature,
			expiry,
		});

		return c.json({ success: true });
	},
);

export default multisigRouter;
