// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	verifyProposalProposer,
	verifyProposer,
	type ProofResult,
	type PublicProposal,
	type TrustedMembers,
} from '@mysten/sagat';
import type {
	AccountDetails,
	Proposal,
} from '@mysten/sagat/v1';

import { type AliasRead } from './alias-set';
import {
	checkActingSets,
	originalSignerSet,
	rebuildAccount,
	shownActingSets,
	type AccountSigners,
} from './proposal-integrity';
import { sameAddress } from './sui-utils';

export type ProposerProofAccount = Pick<
	AccountDetails,
	'address' | 'signerSets' | 'proposers'
>;

/** Whether `account` is `openedAddress` and its original signers make up that address. */
export function trustsSigners(
	account: Pick<AccountDetails, 'address' | 'signerSets'>,
	openedAddress: string,
) {
	return (
		sameAddress(account.address, openedAddress) &&
		rebuildAccount(
			originalSignerSet(account),
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

/** What `checkProposalProposer` reads of a proposal. */
export type ProposerProposal = Pick<
	Proposal,
	| 'digest'
	| 'accountAddress'
	| 'proposerAddress'
	| 'transactionBytes'
	| 'signatures'
	| 'events'
	| 'signerSets'
>;

/**
 * Checks a proposal's proposer, trusting the members of its signer sets
 * that act on the proposal's network, whose alias set is `aliases`.
 * Rule 1 is the pod's own check, run where the pod is known.
 */
export async function checkProposalProposer(
	proposal: ProposerProposal,
	aliases: AliasRead,
): Promise<ProposerCheck> {
	const members = trustedMembers(
		proposal.signerSets,
		aliases,
	);
	if (!members) return 'unverified';
	const status = await verifyProposalProposer(
		legacyShape(proposal),
		{ members },
	);
	return status === 'verified' ? null : status;
}

// The SDK's verifier still takes the legacy shape and reads only these fields.
function legacyShape(
	proposal: ProposerProposal,
): PublicProposal {
	const read: Pick<
		PublicProposal,
		| 'digest'
		| 'multisigAddress'
		| 'proposerAddress'
		| 'transactionBytes'
		| 'signatures'
		| 'events'
	> = {
		digest: proposal.digest,
		multisigAddress: proposal.accountAddress,
		proposerAddress: proposal.proposerAddress,
		transactionBytes: proposal.transactionBytes,
		signatures: proposal.signatures,
		events: proposal.events,
	};
	return read as PublicProposal;
}
