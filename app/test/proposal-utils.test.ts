// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { formatDigest } from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';

import {
	isExternalProposer,
	isProposalExpired,
	listsAtCutoff,
	mergeNewestFirst,
	pendingFilter,
	proposalStatusKey,
	proposalTitle,
	shortDigest,
	signatureAddedMessage,
	weightDots,
} from '../src/lib/proposalUtils';
import { transfer } from './transactions';

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
		).toBe(`${'x'.repeat(50)}…`);
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

describe('signatureAddedMessage', () => {
	it('reports the weight still needed after the vote', () => {
		expect(
			signatureAddedMessage(
				{ hasReachedThreshold: false, currentWeight: 2 },
				4,
			),
		).toBe('Signature added. Needs 2 more weight.');
		expect(
			signatureAddedMessage(
				{ hasReachedThreshold: true, currentWeight: 3 },
				3,
			),
		).toBe('Signature added');
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

describe('shortDigest', () => {
	it('keeps the first ten and last four characters', () => {
		expect(shortDigest(DIGEST)).toBe('HkV4y3pGsy…E7ac');
	});

	it('leaves a digest that short whole', () => {
		expect(shortDigest('HkV4y3pGsyPvGy')).toBe(
			'HkV4y3pGsyPvGy',
		);
	});
});

describe('isExternalProposer', () => {
	const signer = new Ed25519Keypair();
	const multisig = {
		address: '0x1',
		threshold: 1,
		members: [
			{
				publicKey: signer.getPublicKey().toSuiPublicKey(),
				weight: 1,
				order: 0,
			},
		],
	};

	it('tells a signer from an address outside the account', () => {
		expect(
			isExternalProposer({
				multisig,
				proposerAddress: signer.toSuiAddress(),
			}),
		).toBe(false);
		expect(
			isExternalProposer({
				multisig,
				proposerAddress:
					new Ed25519Keypair().toSuiAddress(),
			}),
		).toBe(true);
	});
});

describe('pendingFilter', () => {
	// Epoch 10 started at time 1000, and epochs last 100.
	const epochInfo = {
		epoch: '10',
		epochStartTimestampMs: '1000',
		epochDurationMs: '100',
	};
	const multisig = {
		threshold: 1,
		members: [{ publicKey: 'signer', weight: 1 }],
	};
	const signatures = [
		{
			proposalId: 1,
			publicKey: 'signer',
			signature: 'sig',
		},
	];

	it('files a proposal past its last epoch as expired, even at the threshold', async () => {
		const proposal = (lastEpoch: number) =>
			transfer({ Epoch: lastEpoch }).then(
				(transactionBytes) => ({
					status: ProposalStatus.PENDING,
					transactionBytes,
					signatures,
				}),
			);
		const context = {
			multisig,
			publicKey: undefined,
			epochInfo,
		};
		expect(pendingFilter(await proposal(9), context)).toBe(
			'expired',
		);
		expect(pendingFilter(await proposal(10), context)).toBe(
			'ready',
		);
		expect(
			isProposalExpired(
				{
					...(await proposal(9)),
					status: ProposalStatus.SUCCESS,
				},
				epochInfo,
			),
		).toBe(false);
	});
});

// Rows with just these ids, for the merge helpers.
const ids = (...list: number[]) =>
	list.map((id) => ({ id }));

describe('mergeNewestFirst', () => {
	it('holds back rows a list with more to load could still go above', () => {
		// Executed has loaded 100–98 with more to come; failed 50–48.
		const executed = ids(100, 99, 98);
		const failed = ids(50, 49, 48);
		expect(
			mergeNewestFirst([
				{ rows: executed, hasNextPage: true },
				{ rows: failed, hasNextPage: false },
			]).map((row) => row.id),
		).toEqual([100, 99, 98]);
		expect(
			mergeNewestFirst([
				{ rows: failed, hasNextPage: false },
				{ rows: executed, hasNextPage: false },
			]).map((row) => row.id),
		).toEqual([100, 99, 98, 50, 49, 48]);
	});

	it('cuts interleaved lists at the oldest row a list with more could precede', () => {
		expect(
			mergeNewestFirst([
				{ rows: ids(100, 60, 40), hasNextPage: true },
				{ rows: ids(70, 50, 30), hasNextPage: false },
			]).map((row) => row.id),
		).toEqual([100, 70, 60, 50, 40]);
	});

	it('shows nothing while a list with more to load has no rows yet', () => {
		expect(
			mergeNewestFirst([
				{ rows: [], hasNextPage: true },
				{ rows: ids(50, 49), hasNextPage: false },
			]),
		).toEqual([]);
	});
});

describe('listsAtCutoff', () => {
	it('loads more only from the list that sets the cutoff', () => {
		// Executed's next page can show more; failed's rows below 98 stay
		// hidden whatever its next page holds.
		expect(
			listsAtCutoff([
				{ rows: ids(100, 99, 98), hasNextPage: true },
				{ rows: ids(50, 49, 48), hasNextPage: true },
			]),
		).toEqual([0]);
	});
});
