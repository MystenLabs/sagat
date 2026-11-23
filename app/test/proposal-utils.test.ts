// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { type Proposal } from '@mysten/sagat/v1';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { formatDigest } from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';

import {
	countSignerSets,
	isExternalProposer,
	isProposalExpired,
	listsAtCutoff,
	mergeNewestFirst,
	pendingFilter,
	proposalExplorerUrl,
	proposalStatusKey,
	proposalTitle,
	shortDigest,
	shownSignerSet,
	signatureAddedMessage,
	toProposalCardInput,
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
				checkedSignerSets: [
					{ currentWeight: 0, threshold: 2 },
				],
			}),
		).toBe('executed');
		expect(
			proposalStatusKey({
				status: ProposalStatus.CANCELLED,
				checkedSignerSets: [
					{ currentWeight: 2, threshold: 2 },
				],
			}),
		).toBe('cancelled');
		expect(
			proposalStatusKey({
				status: ProposalStatus.FAILURE,
				checkedSignerSets: [
					{ currentWeight: 2, threshold: 2 },
				],
			}),
		).toBe('failed');
	});

	it('splits pending proposals by whether they reach the threshold', () => {
		expect(
			proposalStatusKey({
				status: ProposalStatus.PENDING,
				checkedSignerSets: [
					{ currentWeight: 1, threshold: 2 },
				],
			}),
		).toBe('pending');
		expect(
			proposalStatusKey({
				status: ProposalStatus.PENDING,
				checkedSignerSets: [
					{ currentWeight: 3, threshold: 2 },
				],
			}),
		).toBe('ready');
	});
});

describe('proposalExplorerUrl', () => {
	it('links to the explorer only once the transaction ran on chain', () => {
		const proposal = { digest: DIGEST, network: 'mainnet' };
		const url = `https://suiscan.xyz/mainnet/tx/${DIGEST}`;
		expect(proposalExplorerUrl('executed', proposal)).toBe(
			url,
		);
		expect(proposalExplorerUrl('failed', proposal)).toBe(
			url,
		);
		expect(
			proposalExplorerUrl('pending', proposal),
		).toBeNull();
	});
});

describe('proposalTitle', () => {
	it('uses the trimmed description in full', () => {
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
		).toBe('x'.repeat(60));
	});

	it('falls back to the short digest', () => {
		expect(
			proposalTitle({ description: null, digest: DIGEST }),
		).toBe(formatDigest(DIGEST));
		expect(
			proposalTitle({ description: '  ', digest: DIGEST }),
		).toBe(formatDigest(DIGEST));
	});
});

describe('signatureAddedMessage', () => {
	it('reports the weight still needed after the vote', () => {
		expect(
			signatureAddedMessage({
				currentWeight: 2,
				threshold: 4,
			}),
		).toBe('Signature added. Needs 2 more weight.');
		expect(
			signatureAddedMessage({
				currentWeight: 3,
				threshold: 3,
			}),
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
				checkedSignerSets: [multisig],
				proposerAddress: signer.toSuiAddress(),
			}),
		).toBe(false);
		expect(
			isExternalProposer({
				checkedSignerSets: [multisig],
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
		members: [{ publicKey: 'signer', weight: 1, order: 0 }],
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
					checkedSignerSets: countSignerSets(
						{ signatures },
						[{ set: multisig, address: '0x1' }],
						null,
					),
				}),
			);
		const context = {
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

describe('countSignerSets', () => {
	const key = (weight: number, order: number) => ({
		publicKey: new Ed25519Keypair()
			.getPublicKey()
			.toSuiPublicKey(),
		weight,
		order,
	});

	it('counts a key in every set that holds it, ready once any one set reaches its threshold', () => {
		const shared = key(1, 0);
		const solo = { threshold: 1, members: [shared] };
		const pair = {
			threshold: 2,
			members: [shared, key(1, 1)],
		};
		const signedBy = (...keys: { publicKey: string }[]) =>
			keys.map(({ publicKey }) => ({
				proposalId: 1,
				publicKey,
				signature: 'sig',
			}));

		const counted = countSignerSets(
			{ signatures: signedBy(shared) },
			[
				{ set: pair, address: '0x2' },
				{ set: solo, address: '0x1' },
			],
			null,
		);
		expect(
			counted.map((set) => [
				set.address,
				set.currentWeight,
			]),
		).toEqual([
			['0x2', 1],
			['0x1', 1],
		]);
		expect(
			proposalStatusKey({
				status: ProposalStatus.PENDING,
				checkedSignerSets: counted,
			}),
		).toBe('ready');
		expect(shownSignerSet(counted)?.address).toBe('0x1');

		const neither = countSignerSets(
			{ signatures: [] },
			[
				{ set: pair, address: '0x2' },
				{ set: solo, address: '0x1' },
			],
			null,
		);
		expect(
			proposalStatusKey({
				status: ProposalStatus.PENDING,
				checkedSignerSets: neither,
			}),
		).toBe('pending');
	});

	it('counts no signer set that is not an alias of the pod', () => {
		const keys = [
			new Ed25519Keypair(),
			new Ed25519Keypair(),
		];
		const setOf = (keypair: Ed25519Keypair) => {
			const publicKey = keypair.getPublicKey();
			const members = [
				{
					publicKey: publicKey.toSuiPublicKey(),
					weight: 1,
					order: 0,
				},
			];
			return {
				address: MultiSigPublicKey.fromPublicKeys({
					threshold: 1,
					publicKeys: [{ publicKey, weight: 1 }],
				}).toSuiAddress(),
				threshold: 1,
				currentWeight: 0,
				hasReachedThreshold: false,
				members,
			};
		};
		const [current, stranger] = keys.map(setOf);
		const proposal: Proposal = {
			id: 1,
			digest: DIGEST,
			accountAddress: '0x1',
			accountName: null,
			network: 'localnet',
			status: ProposalStatus.PENDING,
			transactionBytes: '',
			proposerAddress: keys[1].toSuiAddress(),
			description: null,
			createdAt: '2026-11-23T10:00:00.000Z',
			signatures: [
				{
					proposalId: 1,
					publicKey: stranger.members[0].publicKey,
					signature: 'sig',
				},
			],
			hasReachedThreshold: true,
			signerSets: [current, stranger],
			events: { created: null, proposer: null },
			executedVia: null,
			aliasCalls: [],
			signerSetsStale: false,
		};

		const counted = toProposalCardInput(
			proposal,
			{ kind: 'read', aliases: [current.address] },
			keys[1].toSuiAddress(),
		);
		expect(
			counted.checkedSignerSets.map((set) => set.address),
		).toEqual([current.address]);
		expect(proposalStatusKey(counted)).toBe('pending');
		expect(isExternalProposer(counted)).toBe(true);
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
