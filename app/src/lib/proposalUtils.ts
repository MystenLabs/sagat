// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	ProposalSignerSet,
	PublicProposal,
} from '@mysten/sagat';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { formatAddress } from '@mysten/sui/utils';

import { extractPublicKeyFromBase64 } from './wallet';

/*
 * Progress comes from the server: every proposal it returns carries
 * `signerSets`, the account's sets valid on the proposal's network, each
 * tallied. The app never recounts it from the account, which would not
 * know which sets are valid where.
 */

// A signer set that can execute the proposal now, if any. The first one,
// in link order, so the choice is stable across renders.
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

/**
 * The progress a card shows after "Signature Weight:". One signer set
 * reads as before ("1/2"). Several read per set, the one shown by
 * `getProgressSignerSet` first: "2 of 3 via Operations, 1 of 4 via Board".
 * Null when no signer set is valid on the proposal's network.
 */
export function describeProgress(
	signerSets: ProposalSignerSet[],
): string | null {
	const progress = getProgressSignerSet(signerSets);
	if (!progress) return null;
	if (signerSets.length === 1)
		return `${progress.currentWeight}/${progress.threshold}`;
	return [
		progress,
		...signerSets.filter((s) => s !== progress),
	]
		.map(
			(s) =>
				`${s.currentWeight} of ${s.threshold} via ${s.label || formatAddress(s.address)}`,
		)
		.join(', ');
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
