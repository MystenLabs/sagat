// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { BAR_SEGMENT_CAP } from './create-multisig';

/** Whose weight a part of the bar is: yours, an accepted signer's, or still pending. */
export type WeightTone = 'you' | 'accepted' | 'pending';

export type WeightedSigner = {
	weight: number;
	tone: WeightTone;
};

/**
 * The weight bar on an invitation, in signer order: one segment per unit
 * of weight up to the same cap as the create wizard's threshold bar, then
 * one run per signer sized by their weight with the threshold as a share
 * of the total.
 */
export function weightBar(
	signers: WeightedSigner[],
	threshold: number,
):
	| { kind: 'segments'; tones: WeightTone[] }
	| {
			kind: 'runs';
			runs: WeightedSigner[];
			percent: number;
	  } {
	const totalWeight = signers.reduce(
		(sum, signer) => sum + signer.weight,
		0,
	);
	if (totalWeight <= BAR_SEGMENT_CAP)
		return {
			kind: 'segments',
			tones: signers.flatMap((signer) =>
				Array.from(
					{ length: Math.max(signer.weight, 0) },
					() => signer.tone,
				),
			),
		};
	return {
		kind: 'runs',
		runs: signers.filter((signer) => signer.weight > 0),
		percent: Math.min(threshold / totalWeight, 1) * 100,
	};
}

/**
 * The CSS `left` of a 2px threshold marker over `count` segments with
 * `gap` pixels between them: the middle of the gap after the segment
 * the threshold lands on, or the bar's end when it needs every unit.
 */
export function thresholdMarkerLeft(
	threshold: number,
	count: number,
	gap = 4,
) {
	if (threshold >= count) return 'calc(100% - 1px)';
	const segments = `(100% - ${(count - 1) * gap}px) * ${threshold / count}`;
	const gaps = (threshold - 1) * gap + gap / 2 - 1;
	return `calc(${segments} + ${gaps}px)`;
}
