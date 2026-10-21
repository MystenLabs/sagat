// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { BAR_SEGMENT_CAP, sumWeight } from './threshold';

/** Whose weight a part of the bar is: yours, accepted, or pending. */
export type WeightTone = 'you' | 'accepted' | 'pending';

export type WeightedSigner = {
	weight: number;
	tone: WeightTone;
};

/**
 * The space between segments: Tailwind's `gap-1`, the same gap the
 * create wizard's threshold bar draws with. A number rather than the
 * class so the marker maths below can use it too.
 */
export const SEGMENT_GAP_PX = 4;

/** The threshold marker's width; its `left` is offset by half of it. */
export const MARKER_WIDTH_PX = 2;

/** Accepted weight comes first, then yours, then what is still pending. */
const TONE_ORDER: Record<WeightTone, number> = {
	accepted: 0,
	you: 1,
	pending: 2,
};

/**
 * How the weight bar on an invitation is drawn: accepted weight first,
 * then yours, then the pending rest, so the threshold marker reads
 * against what has been accepted so far. One segment per unit of weight
 * up to the same cap as the create wizard's threshold bar, then one run
 * per signer sized by their weight with the threshold as a share of the
 * total.
 */
export function weightBarLayout(
	unordered: WeightedSigner[],
	threshold: number,
):
	| { kind: 'segments'; tones: WeightTone[] }
	| {
			kind: 'runs';
			runs: WeightedSigner[];
			thresholdPercent: number;
	  } {
	const signers = [...unordered].sort(
		(a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone],
	);
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

/** The marker's `left` over gapless runs: centred on the threshold's share. */
export function runMarkerLeft(thresholdPercent: number) {
	return `calc(${thresholdPercent}% - ${MARKER_WIDTH_PX / 2}px)`;
}
