// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure functions over a proposal's signatures and the account's valid signer
 * sets: progress per set, which set to execute with, and the signature order
 * for combining. No database or network access, so they can be unit tested
 * and used by clients, which combine signatures and execute.
 * Re-exported by signer-resolution.service.ts, which is the entry point.
 */

import { normalizeSuiAddress } from '@mysten/sui/utils';

import type {
	AccountSignerSet,
	Proposal,
	ProposalSignature,
	SignerSet,
	SignerSetMember,
} from '../db/schema';

/**
 * The parts of a signer set the progress math needs, with its label in the
 * account. `AccountSignerSetWithMembers` satisfies it.
 */
export type SignerSetComposition = Pick<
	SignerSet,
	'address' | 'threshold'
> &
	Pick<AccountSignerSet, 'label'> & {
		members: Pick<
			SignerSetMember,
			'publicKey' | 'weight' | 'order' | 'isAccepted'
		>[];
	};

/** The parts of a proposal the progress math needs. `ProposalWithSignatures` satisfies it. */
export type ProposalSignatures = Pick<
	Proposal,
	'accountAddress'
> & {
	signatures: Pick<
		ProposalSignature,
		'publicKey' | 'signature'
	>[];
};

export interface SignerSetProgress {
	address: string;
	label: string | null;
	threshold: number;
	totalWeight: number;
	currentWeight: number;
	hasReachedThreshold: boolean;
	members: {
		publicKey: string;
		weight: number;
		order: number;
		/**
		 * False for a member who has not accepted the invitation. Their weight
		 * still counts (the chain accepts any key in the composition), but access
		 * checks do not treat them as able to sign for the account.
		 */
		isAccepted: boolean;
		hasSigned: boolean;
	}[];
}

const byOrder = <T extends { order: number }>(
	members: T[],
) => [...members].sort((a, b) => a.order - b.order);

/**
 * Progress of a proposal per signer set. A signature counts toward every set
 * that contains its key. Signatures from keys in no set are ignored.
 */
export function proposalProgress(
	proposal: ProposalSignatures,
	validSignerSets: SignerSetComposition[],
): SignerSetProgress[] {
	const signed = new Set(
		proposal.signatures.map((s) => s.publicKey),
	);

	return validSignerSets.map((set) => {
		const members = byOrder(set.members).map((m) => ({
			publicKey: m.publicKey,
			weight: m.weight,
			order: m.order,
			isAccepted: m.isAccepted,
			hasSigned: signed.has(m.publicKey),
		}));
		const totalWeight = members.reduce(
			(acc, m) => acc + m.weight,
			0,
		);
		const currentWeight = members.reduce(
			(acc, m) => acc + (m.hasSigned ? m.weight : 0),
			0,
		);
		return {
			address: set.address,
			label: set.label,
			threshold: set.threshold,
			totalWeight,
			currentWeight,
			hasReachedThreshold: currentWeight >= set.threshold,
			members,
		};
	});
}

/**
 * A signer set that has reached its threshold, or null: the account's
 * original composition if it has, otherwise the first in the order of
 * `validSignerSets`. For clients, which combine signatures and execute.
 */
export function pickExecutableSignerSet<
	T extends SignerSetComposition,
>(
	proposal: ProposalSignatures,
	validSignerSets: T[],
): T | null {
	const account = normalizeSuiAddress(
		proposal.accountAddress,
	);
	const progress = proposalProgress(
		proposal,
		validSignerSets,
	);
	const executable = validSignerSets.filter(
		(_, i) => progress[i].hasReachedThreshold,
	);
	return (
		executable.find(
			(set) => normalizeSuiAddress(set.address) === account,
		) ??
		executable[0] ??
		null
	);
}

/**
 * The proposal's signatures from the set's members, in member order, ready
 * for `MultiSigPublicKey.combinePartialSignatures`. Mirrors the ordering in
 * app/src/hooks/useExecuteProposal.ts.
 */
export function orderedSignaturesFor(
	proposal: ProposalSignatures,
	signerSet: SignerSetComposition,
): string[] {
	const ordered: string[] = [];
	for (const member of byOrder(signerSet.members)) {
		const signature = proposal.signatures.find(
			(s) => s.publicKey === member.publicKey,
		);
		if (signature) ordered.push(signature.signature);
	}
	return ordered;
}
