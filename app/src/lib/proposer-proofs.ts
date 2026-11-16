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

/** `invalid`: the proof doesn't check out; `unconfirmed`: no signer confirmed them. */
export type ProposerCheck =
	'invalid' | 'unconfirmed' | null;

/** Checks a proposal's proposer, with the same member rule as `verifyProposers`. */
export async function checkProposalProposer(
	proposal: PublicProposal,
): Promise<ProposerCheck> {
	if (
		!rebuildAccount(
			proposal.multisig,
			proposal.multisigAddress,
		)
	)
		return 'unconfirmed';
	const { status, proposer } = await verifyProposalProposer(
		proposal,
		{ members: proposal.multisig.members },
	);
	if (status === 'invalid') return 'invalid';
	// A missing `created` event alone, from before the audit log, isn't flagged.
	return proposer.status === 'unverified'
		? 'unconfirmed'
		: null;
}
