// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	verifyProposalProposer,
	verifyProposer,
	type ProofResult,
	type PublicProposal,
	type TrustedMembers,
} from '@mysten/sagat';
import { type AccountDetails } from '@mysten/sagat/v1';

import { type AliasRead } from './alias-set';
import {
	checkActingSets,
	rebuildAccount,
	shownActingSets,
	type AccountSigners,
} from './proposal-integrity';
import { sameAddress } from './sui-utils';

export type ProposerProofAccount = Pick<
	AccountDetails,
	| 'address'
	| 'originalSignerSet'
	| 'signerSets'
	| 'proposers'
>;

/** Whether `account` is `openedAddress` and its original signers make up that address. */
export function trustsSigners(
	account: Pick<
		AccountDetails,
		'address' | 'originalSignerSet'
	>,
	openedAddress: string,
) {
	return (
		sameAddress(account.address, openedAddress) &&
		rebuildAccount(
			account.originalSignerSet,
			account.address,
		) !== null
	);
}

/** The keys of every shown set that passes rule 2, or null when none does or the alias set couldn't be read. */
export function trustedMembers(
	shown: readonly AccountSigners[],
	aliases: AliasRead,
): TrustedMembers | null {
	const check = checkActingSets(shown, aliases);
	if (
		check.kind === 'unchecked' ||
		check.acting.length === 0
	)
		return null;
	return check.acting.flatMap(({ set }) => set.members);
}

/** The members trusted to confirm proposers: rule 1 must pass first, then rule 2 on the network `aliases` was read on. */
export function proposerProofMembers(
	account: ProposerProofAccount,
	openedAddress: string,
	aliases: AliasRead,
): TrustedMembers | null {
	return trustsSigners(account, openedAddress)
		? trustedMembers(shownActingSets(account), aliases)
		: null;
}

/**
 * Each proposer's proof from their newest add or remove, keyed by address.
 * `openedAddress` is the account the viewer opened, from the route;
 * `aliases` is its alias set on the network in question.
 */
export async function verifyProposers(
	account: ProposerProofAccount,
	openedAddress: string,
	aliases: AliasRead,
): Promise<Map<string, ProofResult>> {
	const members = proposerProofMembers(
		account,
		openedAddress,
		aliases,
	);
	if (!members)
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
						members,
					}),
				] as const,
		),
	);
	return new Map(results);
}

/** `invalid`: a proof doesn't check out; `unverified`: no proof shows who proposed it. */
export type ProposerCheck = 'invalid' | 'unverified' | null;

/** Checks a proposal's proposer, trusting members only when they make up the account and act on the proposal's network, whose alias set is `aliases`. */
export async function checkProposalProposer(
	proposal: PublicProposal,
	aliases: AliasRead,
): Promise<ProposerCheck> {
	if (
		!rebuildAccount(
			proposal.multisig,
			proposal.multisigAddress,
		)
	)
		return 'unverified';
	const members = trustedMembers(
		shownActingSets(proposal.multisig),
		aliases,
	);
	if (!members) return 'unverified';
	const status = await verifyProposalProposer(proposal, {
		members,
	});
	return status === 'verified' ? null : status;
}
