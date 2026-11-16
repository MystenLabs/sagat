// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	verifyProposer,
	type MultisigWithMembers,
	type ProofResult,
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
