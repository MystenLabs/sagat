// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { BAR_SEGMENT_CAP } from './threshold';

/** Whose weight a part of the bar is: yours, accepted, or pending. */
export type WeightTone = 'you' | 'accepted' | 'pending';

export type WeightedSigner = {
	weight: number;
	tone: WeightTone;
};

/**
 * The space between segments, used by the markup and by the marker
 * maths so the marker lands in the middle of a gap.
 */
export const SEGMENT_GAP_PX = 4;

/** The marker's width; its `left` is offset by half of it. */
const MARKER_WIDTH_PX = 2;

export function sumWeight(signers: WeightedSigner[]) {
	return signers.reduce(
		(total, signer) => total + signer.weight,
		0,
	);
}

/**
 * How the weight bar on an invitation is drawn, in signer order: one
 * segment per unit of weight up to the same cap as the create wizard's
 * threshold bar, then one run per signer sized by their weight with the
 * threshold as a share of the total.
 */
export function weightBarLayout(
	signers: WeightedSigner[],
	threshold: number,
):
	| { kind: 'segments'; tones: WeightTone[] }
	| {
			kind: 'runs';
			runs: WeightedSigner[];
			thresholdPercent: number;
	  } {
	const totalWeight = sumWeight(signers);
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
		thresholdPercent:
			Math.min(threshold / totalWeight, 1) * 100,
	};
}

/**
 * The CSS `left` of the threshold marker over `count` segments: the
 * middle of the gap after the segment the threshold lands on, or the
 * bar's end when it needs every unit.
 */
export function thresholdMarkerLeft(
	threshold: number,
	count: number,
) {
	const half = MARKER_WIDTH_PX / 2;
	if (threshold >= count) return `calc(100% - ${half}px)`;
	const gap = SEGMENT_GAP_PX;
	const segments = `(100% - ${(count - 1) * gap}px) * ${threshold / count}`;
	const gaps = (threshold - 1) * gap + gap / 2 - half;
	return `calc(${segments} + ${gaps}px)`;
}
