// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import {
	thresholdMarkerLeft,
	weightBar,
} from '../src/lib/weight-bar';

describe('weightBar', () => {
	it('draws one segment per unit of weight in signer order', () => {
		expect(
			weightBar(
				[
					{ weight: 2, tone: 'accepted' },
					{ weight: 1, tone: 'you' },
					{ weight: 1, tone: 'pending' },
				],
				3,
			),
		).toEqual({
			kind: 'segments',
			tones: ['accepted', 'accepted', 'you', 'pending'],
		});
	});

	it('switches to one run per signer past ten units', () => {
		const bar = weightBar(
			[
				{ weight: 8, tone: 'accepted' },
				{ weight: 0, tone: 'pending' },
				{ weight: 4, tone: 'you' },
			],
			6,
		);
		expect(bar).toEqual({
			kind: 'runs',
			runs: [
				{ weight: 8, tone: 'accepted' },
				{ weight: 4, tone: 'you' },
			],
			percent: 50,
		});
	});
});

describe('thresholdMarkerLeft', () => {
	it('sits in the middle of the gap after the threshold segment', () => {
		expect(thresholdMarkerLeft(4, 7)).toBe(
			`calc((100% - 24px) * ${4 / 7} + 13px)`,
		);
		expect(thresholdMarkerLeft(1, 2)).toBe(
			'calc((100% - 4px) * 0.5 + 1px)',
		);
	});

	it('sits at the end when every unit is needed', () => {
		expect(thresholdMarkerLeft(7, 7)).toBe(
			'calc(100% - 1px)',
		);
	});
});
