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

/**
 * Checks each proposer's newest add or remove, keyed by proposer address.
 * The members vouch only when they make up the account's address, so
 * otherwise no proposer comes out verified.
 */
export async function verifyProposers(
	account: ProposerProofAccount,
): Promise<Map<string, ProofResult>> {
	const members = rebuildAccount(account, account.address)
		? account.members
		: [];
	const results = await Promise.all(
		account.proposers.map(
			async (proposer) =>
				[
					proposer.address,
					await verifyProposer({
						proposer: proposer.address,
						event: proposer.event,
						accountAddress: account.address,
						members,
					}),
				] as const,
		),
	);
	return new Map(results);
}

/**
 * What a proposal's external proposer means for signing it: `invalid`,
 * their proof doesn't check out; `unconfirmed`, no signer has confirmed
 * them; null, nothing to flag.
 */
export type ProposerCheck =
	'invalid' | 'unconfirmed' | null;

/** Checks a proposal's proposer, with the same member rule as `verifyProposers`. */
export async function checkProposalProposer(
	proposal: PublicProposal,
): Promise<ProposerCheck> {
	const members = rebuildAccount(
		proposal.multisig,
		proposal.multisigAddress,
	)
		? proposal.multisig.members
		: [];
	const { status, proposer } = await verifyProposalProposer(
		proposal,
		{ members },
	);
	if (status === 'invalid') return 'invalid';
	// A missing `created` event alone, from before the audit log, isn't flagged.
	return proposer.status === 'unverified'
		? 'unconfirmed'
		: null;
}
