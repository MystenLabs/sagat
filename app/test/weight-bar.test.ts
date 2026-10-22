// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { weightTone } from '../src/lib/member-status';
import {
	runMarkerLeft,
	thresholdMarkerLeft,
	weightBarLayout,
} from '../src/lib/weight-bar';

describe('weightBarLayout', () => {
	it('draws one segment per unit of weight, accepted first, then yours', () => {
		// Signer order is Daniel (pending), you, then two accepted signers.
		expect(
			weightBarLayout(
				[
					{ weight: 1, tone: 'pending' },
					{ weight: 1, tone: 'you' },
					{ weight: 1, tone: 'accepted' },
					{ weight: 1, tone: 'accepted' },
				],
				2,
			),
		).toEqual({
			kind: 'segments',
			tones: ['accepted', 'accepted', 'you', 'pending'],
		});
	});

	it('expands each signer into one segment per unit of their weight', () => {
		expect(
			weightBarLayout(
				[
					{ weight: 2, tone: 'accepted' },
					{ weight: 1, tone: 'you' },
					{ weight: 1, tone: 'accepted' },
				],
				3,
			),
		).toEqual({
			kind: 'segments',
			tones: ['accepted', 'accepted', 'accepted', 'you'],
		});
	});

	it('collapses to one run per signer past ten units, in the same order', () => {
		expect(
			weightBarLayout(
				[
					{ weight: 2, tone: 'you' },
					{ weight: 0, tone: 'pending' },
					{ weight: 4, tone: 'accepted' },
					{ weight: 1, tone: 'pending' },
					{ weight: 3, tone: 'accepted' },
					{ weight: 2, tone: 'pending' },
				],
				8,
			),
		).toEqual({
			kind: 'runs',
			runs: [
				{ weight: 4, tone: 'accepted' },
				{ weight: 3, tone: 'accepted' },
				{ weight: 2, tone: 'you' },
				{ weight: 1, tone: 'pending' },
				{ weight: 2, tone: 'pending' },
			],
			thresholdPercent: (8 / 12) * 100,
		});
	});

	it('caps the threshold share at the whole bar', () => {
		const bar = weightBarLayout(
			[
				{ weight: 6, tone: 'accepted' },
				{ weight: 6, tone: 'you' },
			],
			15,
		);
		expect(bar.kind).toBe('runs');
		if (bar.kind === 'runs')
			expect(bar.thresholdPercent).toBe(100);
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

	it('is centred on the threshold share over runs', () => {
		expect(runMarkerLeft(50)).toBe('calc(50% - 1px)');
		expect(runMarkerLeft((8 / 12) * 100)).toBe(
			`calc(${(8 / 12) * 100}% - 1px)`,
		);
	});
});

describe('weightTone', () => {
	it('counts your weight as accepted once you have accepted', () => {
		expect(
			weightTone({ isAccepted: true, isYou: true }),
		).toBe('accepted');
		expect(
			weightTone({ isAccepted: false, isYou: true }),
		).toBe('you');
		expect(
			weightTone({ isAccepted: false, isYou: false }),
		).toBe('pending');
	});
});
