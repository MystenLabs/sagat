// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { formatDigest } from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';

import {
	proposalStatusKey,
	proposalTitle,
	weightDots,
} from '../src/lib/proposalUtils';

const DIGEST =
	'HkV4y3pGsyPvGyX7tfm9MGKvjEsPKDpr5DW2KzuaE7ac';

describe('proposalStatusKey', () => {
	it('reports terminal statuses as they are', () => {
		expect(
			proposalStatusKey({
				status: ProposalStatus.SUCCESS,
				currentWeight: 0,
				totalWeight: 2,
			}),
		).toBe('executed');
		expect(
			proposalStatusKey({
				status: ProposalStatus.CANCELLED,
				currentWeight: 2,
				totalWeight: 2,
			}),
		).toBe('cancelled');
		expect(
			proposalStatusKey({
				status: ProposalStatus.FAILURE,
				currentWeight: 2,
				totalWeight: 2,
			}),
		).toBe('failed');
	});

	it('splits pending proposals by whether they reach the threshold', () => {
		expect(
			proposalStatusKey({
				status: ProposalStatus.PENDING,
				currentWeight: 1,
				totalWeight: 2,
			}),
		).toBe('pending');
		expect(
			proposalStatusKey({
				status: ProposalStatus.PENDING,
				currentWeight: 3,
				totalWeight: 2,
			}),
		).toBe('ready');
	});
});

describe('proposalTitle', () => {
	it('uses the description, cut at 50 characters', () => {
		expect(
			proposalTitle({
				description: '  Pay the grants wallet ',
				digest: DIGEST,
			}),
		).toBe('Pay the grants wallet');
		expect(
			proposalTitle({
				description: 'x'.repeat(60),
				digest: DIGEST,
			}),
		).toBe(`${'x'.repeat(50)}...`);
	});

	it('falls back to the short digest', () => {
		expect(
			proposalTitle({ description: null, digest: DIGEST }),
		).toBe(`Transaction ${formatDigest(DIGEST)}`);
		expect(
			proposalTitle({ description: '  ', digest: DIGEST }),
		).toBe(`Transaction ${formatDigest(DIGEST)}`);
	});
});

describe('weightDots', () => {
	it('shows one dot per unit of weight', () => {
		expect(
			weightDots({ currentWeight: 2, totalWeight: 4 }),
		).toEqual({ dots: 4, filled: 2 });
		expect(
			weightDots({ currentWeight: 0, totalWeight: 1 }),
		).toEqual({ dots: 1, filled: 0 });
	});

	it('caps the filled dots at the threshold', () => {
		expect(
			weightDots({ currentWeight: 5, totalWeight: 3 }),
		).toEqual({ dots: 3, filled: 3 });
	});

	it('scales large thresholds down to ten dots', () => {
		expect(
			weightDots({ currentWeight: 25, totalWeight: 100 }),
		).toEqual({ dots: 10, filled: 3 });
		expect(
			weightDots({ currentWeight: 100, totalWeight: 100 }),
		).toEqual({ dots: 10, filled: 10 });
	});

	it('keeps a scaled proposal short of full until it reaches the threshold', () => {
		expect(
			weightDots({ currentWeight: 95, totalWeight: 100 }),
		).toEqual({ dots: 10, filled: 9 });
		expect(
			weightDots({ currentWeight: 1, totalWeight: 100 }),
		).toEqual({ dots: 10, filled: 1 });
		expect(
			weightDots({ currentWeight: 0, totalWeight: 100 }),
		).toEqual({ dots: 10, filled: 0 });
	});
});
