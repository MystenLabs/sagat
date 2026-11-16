// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	verifyProposalProposer,
	verifyProposer,
	type MultisigWithMembers,
	type ProofResult,
	type PublicProposal,
} from '@mysten/sagat';

import {
	rebuildAccount,
	type AccountSigners,
} from './proposal-integrity';

export type ProposerProofAccount = AccountSigners &
	Pick<MultisigWithMembers, 'address' | 'proposers'>;

/** Each proposer's proof from their newest add or remove, keyed by address. */
export async function verifyProposers(
	account: ProposerProofAccount,
): Promise<Map<string, ProofResult>> {
	// Members vouch only when they make up the account's address.
	if (!rebuildAccount(account, account.address))
		return new Map(
			account.proposers.map((proposer) => [
				proposer.address,
				{
					status: 'unverified',
					signer: null,
					createdAt: proposer.event?.createdAt ?? null,
				},
			]),
		);
	const results = await Promise.all(
		account.proposers.map(
			async (proposer) =>
				[
					proposer.address,
					await verifyProposer({
						proposer: proposer.address,
						event: proposer.event,
						accountAddress: account.address,
						members: account.members,
					}),
				] as const,
		),
	);
	return new Map(results);
}

/** `invalid`: a proof doesn't check out; `unverified`: no proof shows who proposed it. */
export type ProposerCheck = 'invalid' | 'unverified' | null;

/** Checks a proposal's proposer, trusting members only when they make up the account. */
export async function checkProposalProposer(
	proposal: PublicProposal,
): Promise<ProposerCheck> {
	if (
		!rebuildAccount(
			proposal.multisig,
			proposal.multisigAddress,
		)
	)
		return 'unverified';
	const { status } = await verifyProposalProposer(
		proposal,
		{ members: proposal.multisig.members },
	);
	return status === 'verified' ? null : status;
}
