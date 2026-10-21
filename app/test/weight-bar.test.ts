// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { weightTone } from '../src/components/invitations/member-status';
import {
	runMarkerLeft,
	thresholdMarkerLeft,
	weightBarLayout,
} from '../src/lib/weight-bar';

describe('weightBarLayout', () => {
	it('draws one segment per unit of weight in signer order', () => {
		expect(
			weightBarLayout(
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
		expect(
			weightBarLayout(
				[
					{ weight: 8, tone: 'accepted' },
					{ weight: 0, tone: 'pending' },
					{ weight: 4, tone: 'you' },
				],
				6,
			),
		).toEqual({
			kind: 'runs',
			runs: [
				{ weight: 8, tone: 'accepted' },
				{ weight: 4, tone: 'you' },
			],
			thresholdPercent: 50,
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

	it('is centred on the threshold share over runs', () => {
		expect(runMarkerLeft(50)).toBe('calc(50% - 1px)');
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
