// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	combineSignerSetSignatures,
	type ProposalSignerSet,
	type PublicProposal,
} from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';

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

/**
 * What to call the address a proposal was executed via, recorded by
 * verify: the label of a signer set the proposal or the account knows,
 * else the short address (a set added outside Sagat, or a single key).
 * Null until verified.
 */
export function executedViaName(
	proposal: Pick<
		PublicProposal,
		'executedVia' | 'signerSets'
	>,
	accountSignerSets: Pick<
		ProposalSignerSet,
		'address' | 'label'
	>[] = [],
): string | null {
	const address = proposal.executedVia;
	if (!address) return null;
	const known = [
		...proposal.signerSets,
		...accountSignerSets,
	].find((s) => s.address === address);
	return known?.label || formatAddress(address);
}

export function isReadyToExecute(
	signerSets: ProposalSignerSet[],
) {
	return !!getExecutingSignerSet(signerSets);
}

/**
 * The combined signature for a proposal, from the first signer set that has
 * reached its threshold, with only that set's signatures.
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
	return combineSignerSetSignatures(
		signerSet,
		proposal.signatures,
	);
}
