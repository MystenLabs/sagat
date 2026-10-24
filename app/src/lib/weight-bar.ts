// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { BAR_SEGMENT_CAP, sumWeight } from './threshold';

/** Whose weight a part of the bar is: yours, accepted, or pending. */
export type WeightTone = 'you' | 'accepted' | 'pending';

/** A stretch of weight and whose it is. */
export type WeightPart = {
	weight: number;
	tone: WeightTone;
};

/**
 * The space between segments: Tailwind's `gap-1` as a number, so the
 * marker maths below can use it.
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

/** How a weight bar is drawn: unit segments, or runs sized by weight. */
export type WeightBarLayout =
	| { kind: 'segments'; tones: WeightTone[] }
	| {
			kind: 'runs';
			runs: WeightPart[];
			thresholdPercent: number;
	  };

/**
 * How a weight bar is drawn: accepted weight first, then yours, then the
 * pending rest, so the threshold marker reads against what has been
 * accepted so far. One segment per unit of weight up to
 * `BAR_SEGMENT_CAP`, then one run per part sized by its weight with the
 * threshold as a share of the total.
 */
export function weightBarLayout(
	parts: WeightPart[],
	threshold: number,
): WeightBarLayout {
	const ordered = [...parts].sort(
		(a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone],
	);
	const totalWeight = sumWeight(ordered);
	if (totalWeight <= BAR_SEGMENT_CAP)
		return {
			kind: 'segments',
			tones: ordered.flatMap((part) =>
				Array.from(
					{ length: Math.max(part.weight, 0) },
					() => part.tone,
				),
			),
		};
	return {
		kind: 'runs',
		runs: ordered.filter((part) => part.weight > 0),
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
