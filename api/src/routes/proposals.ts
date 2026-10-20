// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Hono, type Context } from 'hono';

import {
	toLegacyPaginatedProposals,
	toLegacyProposal,
	toLegacyPublicProposal,
} from '../legacy/serializers';
import {
	authMiddleware,
	type AuthEnv,
} from '../services/auth.service';
import {
	cancelProposal,
	createProposal,
	getProposalByDigest,
	listProposals,
	verifyProposal,
	verifyProposalByDigest,
	voteOnProposal,
	type CreateProposalInput,
} from '../services/proposals.service';
import { newCursor } from '../utils/pagination';

const proposalsRouter = new Hono();

// Create a new proposed multi-sig transaction.
proposalsRouter.post('/', async (c) => {
	const {
		multisigAddress,
		transactionBytes,
		signature,
		description,
		network,
	}: CreateProposalInput = await c.req.json();

	const proposal = await createProposal({
		multisigAddress,
		transactionBytes,
		signature,
		description,
		network,
	});

	return c.json(toLegacyProposal(proposal), 201);
});

// Adds a signature for the transaction.
proposalsRouter.post('/:proposalId/vote', async (c) => {
	const { signature } = await c.req.json();
	const { proposalId } = c.req.param();

	const { hasReachedThreshold } = await voteOnProposal({
		proposalId: parseInt(proposalId),
		signature,
	});

	return c.json({ hasReachedThreshold });
});

// Cancel a transaction as a valid member of the commitee.
proposalsRouter.post('/:proposalId/cancel', async (c) => {
	const { proposalId } = c.req.param();
	const { signature } = await c.req.json();

	await cancelProposal({
		proposalId: parseInt(proposalId),
		signature,
	});

	return c.json({
		message: 'Proposal cancelled successfully',
	});
});

// Verify the execution of a proposal.
proposalsRouter.post(
	'/:proposalId/verify',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const { proposalId } = c.req.param();

		await verifyProposal({
			proposalId: parseInt(proposalId),
			callerKeys: c.get('publicKeys'),
		});

		return c.json({ verified: true });
	},
);

// Verify the execution of a proposal.
proposalsRouter.post(
	'/:digest/verify-by-digest',
	async (c) => {
		const { digest } = c.req.param();

		await verifyProposalByDigest(digest);

		return c.json({ verified: true });
	},
);

proposalsRouter.get(
	'/',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const {
			multisigAddress,
			status,
			network,
			nextCursor,
			perPage,
		} = c.req.query();

		const proposals = await listProposals({
			multisigAddress,
			network,
			status,
			cursor: newCursor({ nextCursor, perPage }),
			callerKeys: c.get('publicKeys'),
		});

		return c.json(toLegacyPaginatedProposals(proposals));
	},
);

proposalsRouter.get('/digest/:digest', async (c) => {
	const { digest } = c.req.param();

	const { proposal, signerSet, currentWeight } =
		await getProposalByDigest(digest);

	return c.json(
		toLegacyPublicProposal(
			proposal,
			signerSet,
			currentWeight,
		),
	);
});

export default proposalsRouter;
