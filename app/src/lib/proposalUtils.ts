// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	ProposalSignerSet,
	ProposalWithSignatures,
	PublicProposal,
	SignerSetWithMembers,
} from '@mysten/sagat';
import { MultiSigPublicKey } from '@mysten/sui/multisig';

import { extractPublicKeyFromBase64 } from './wallet';

/**
 * A proposal's progress in `signerSet`, in the shape the public proposal
 * gives it, for listings that only have the proposal and the account.
 */
export function tallySignerSet(
	proposal: Pick<ProposalWithSignatures, 'signatures'>,
	signerSet: SignerSetWithMembers,
): ProposalSignerSet {
	const members = signerSet.members.map((member) => ({
		publicKey: member.publicKey,
		weight: member.weight,
		order: member.order,
		hasSigned: proposal.signatures.some(
			(s) => s.publicKey === member.publicKey,
		),
	}));
	const currentWeight = members
		.filter((m) => m.hasSigned)
		.reduce((sum, m) => sum + m.weight, 0);
	return {
		address: signerSet.address,
		label: signerSet.label,
		threshold: signerSet.threshold,
		totalWeight: signerSet.totalWeight,
		currentWeight,
		hasReachedThreshold:
			currentWeight >= signerSet.threshold,
		members,
	};
}

// A signer set that can execute the proposal now, if any.
export function getExecutingSignerSet(
	signerSets: ProposalSignerSet[],
) {
	return signerSets.find((s) => s.hasReachedThreshold);
}

/**
 * The signer set whose progress a card shows: the one that can execute,
 * else the one closest to its threshold. Any of them can execute the
 * proposal, so the closest one is the honest summary.
 */
export function getProgressSignerSet(
	signerSets: ProposalSignerSet[],
) {
	return (
		getExecutingSignerSet(signerSets) ??
		[...signerSets].sort(
			(a, b) =>
				b.currentWeight / b.threshold -
				a.currentWeight / a.threshold,
		)[0]
	);
}

export function isReadyToExecute(
	signerSets: ProposalSignerSet[],
) {
	return !!getExecutingSignerSet(signerSets);
}

/**
 * The combined signature for a proposal, from the first signer set that has
 * reached its threshold: its key is rebuilt from its members in order, and
 * only their signatures are combined. A signature from a key outside the
 * set would make the combination fail.
 */
export function combineProposalSignatures(
	proposal: Pick<
		PublicProposal,
		'signatures' | 'signerSets'
	>,
) {
	const signerSet = getExecutingSignerSet(
		proposal.signerSets,
	);
	if (!signerSet)
		throw new Error(
			'No signer set has reached its threshold',
		);

	const members = [...signerSet.members].sort(
		(a, b) => a.order - b.order,
	);
	const multiSigPublicKey =
		MultiSigPublicKey.fromPublicKeys({
			threshold: signerSet.threshold,
			publicKeys: members.map((m) => ({
				publicKey: extractPublicKeyFromBase64(m.publicKey),
				weight: m.weight,
			})),
		});
	const signatures = members.flatMap((m) => {
		const signature = proposal.signatures.find(
			(s) => s.publicKey === m.publicKey,
		);
		return signature ? [signature.signature] : [];
	});

	return {
		signerSet,
		multiSigPublicKey,
		signature:
			multiSigPublicKey.combinePartialSignatures(
				signatures,
			),
	};
}
