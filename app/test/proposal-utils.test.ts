// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Proposal } from '@mysten/sagat/v1';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import {
	formatDigest,
	fromBase64,
	toBase64,
} from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';

import {
	countSignerSets,
	enablesSignerChanges,
	isExternalProposer,
	isProposalExpired,
	listsAtCutoff,
	mergeNewestFirst,
	pendingFilter,
	proposalExplorerUrl,
	proposalStatusKey,
	proposalTitle,
	rowExecuteSet,
	shortDigest,
	shownSignerSet,
	signatureAddedMessage,
	toProposalCardInput,
	weightDots,
} from '../src/lib/proposalUtils';
import { v1Proposal } from './proposal';
import { listedSet, signerSet } from './signer-set';
import { signerChange, transfer } from './transactions';

const DIGEST =
	'HkV4y3pGsyPvGyX7tfm9MGKvjEsPKDpr5DW2KzuaE7ac';

describe('proposalStatusKey', () => {
	it('reports terminal statuses as they are', () => {
		expect(
			proposalStatusKey({
				status: 'SUCCESS',
				checkedSignerSets: [
					{ currentWeight: 0, threshold: 2 },
				],
			}),
		).toBe('executed');
		expect(
			proposalStatusKey({
				status: 'CANCELLED',
				checkedSignerSets: [
					{ currentWeight: 2, threshold: 2 },
				],
			}),
		).toBe('cancelled');
		expect(
			proposalStatusKey({
				status: 'FAILURE',
				checkedSignerSets: [
					{ currentWeight: 2, threshold: 2 },
				],
			}),
		).toBe('failed');
	});

	it('splits pending proposals by whether they reach the threshold', () => {
		expect(
			proposalStatusKey({
				status: 'PENDING',
				checkedSignerSets: [
					{ currentWeight: 1, threshold: 2 },
				],
			}),
		).toBe('pending');
		expect(
			proposalStatusKey({
				status: 'PENDING',
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
			weightDots({ currentWeight: 2, threshold: 4 }),
		).toEqual({ dots: 4, filled: 2 });
		expect(
			weightDots({ currentWeight: 0, threshold: 1 }),
		).toEqual({ dots: 1, filled: 0 });
	});

	it('caps the filled dots at the threshold', () => {
		expect(
			weightDots({ currentWeight: 5, threshold: 3 }),
		).toEqual({ dots: 3, filled: 3 });
	});

	it('scales large thresholds down to ten dots', () => {
		expect(
			weightDots({ currentWeight: 25, threshold: 100 }),
		).toEqual({ dots: 10, filled: 3 });
		expect(
			weightDots({ currentWeight: 100, threshold: 100 }),
		).toEqual({ dots: 10, filled: 10 });
	});

	it('keeps a scaled proposal short of full until it reaches the threshold', () => {
		expect(
			weightDots({ currentWeight: 95, threshold: 100 }),
		).toEqual({ dots: 10, filled: 9 });
		expect(
			weightDots({ currentWeight: 1, threshold: 100 }),
		).toEqual({ dots: 10, filled: 1 });
		expect(
			weightDots({ currentWeight: 0, threshold: 100 }),
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
				signerSets: [multisig],
				proposerAddress: signer.toSuiAddress(),
			}),
		).toBe(false);
		expect(
			isExternalProposer({
				signerSets: [multisig],
				proposerAddress:
					new Ed25519Keypair().toSuiAddress(),
			}),
		).toBe(true);
	});

	it('marks no member of a listed set as external while the alias read is pending, though no set is counted yet', () => {
		const counted = toProposalCardInput(
			v1Proposal({
				digest: DIGEST,
				proposerAddress: signer.toSuiAddress(),
				signerSets: [
					listedSet({ ...multisig, address: '0x2' }),
				],
			}),
			undefined,
			null,
		);
		expect(counted.checkedSignerSets).toEqual([]);
		expect(isExternalProposer(counted)).toBe(false);
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
			publicKey: 'signer',
			signature: 'sig',
		},
	];

	it('files a proposal past its last epoch as expired, even at the threshold', async () => {
		const proposal = (lastEpoch: number) =>
			transfer({ Epoch: lastEpoch }).then(
				(transactionBytes) => ({
					status: 'PENDING' as const,
					transactionBytes,
					signatures,
					checkedSignerSets: countSignerSets(
						{ signatures, accountAddress: '0x1' },
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
					status: 'SUCCESS',
				},
				epochInfo,
			),
		).toBe(false);
	});

	it('files a held signer change at the threshold by whether the viewer signed, not as ready', async () => {
		const atThreshold = {
			status: 'PENDING' as const,
			transactionBytes: await transfer({ Epoch: 10 }),
			signatures,
			checkedSignerSets: countSignerSets(
				{ signatures, accountAddress: '0x1' },
				[{ set: multisig, address: '0x1' }],
				null,
			),
		};
		const filed = (
			publicKey: string | undefined,
			held: boolean,
		) =>
			pendingFilter(atThreshold, {
				publicKey,
				epochInfo,
				held,
			});
		expect(filed('signer', true)).toBe('waiting');
		expect(filed(undefined, true)).toBe('pending');
		expect(filed('signer', false)).toBe('ready');
	});
});

describe('countSignerSets', () => {
	const key = (
		weight: number,
		order: number,
		keypair = new Ed25519Keypair(),
	) => ({
		publicKey: keypair.getPublicKey().toSuiPublicKey(),
		weight,
		order,
	});

	it('counts a key in every set that holds it, once however often it is listed, ready once any one set reaches its threshold', () => {
		const shared = key(1, 0);
		const solo = { threshold: 1, members: [shared] };
		const pair = {
			threshold: 2,
			members: [shared, key(1, 1)],
		};
		const signature = {
			publicKey: shared.publicKey,
			signature: 'sig',
		};

		const counted = countSignerSets(
			{
				signatures: [signature, signature],
				accountAddress: '0x1',
			},
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
				status: 'PENDING',
				checkedSignerSets: counted,
			}),
		).toBe('ready');
		expect(shownSignerSet(counted)?.address).toBe('0x1');
	});

	it('puts the pod’s own set holding the viewer’s key first wherever it comes, then the others holding it, then the rest', () => {
		const viewer = new Ed25519Keypair();
		const set = (address: string, holds: boolean) => ({
			address,
			set: {
				threshold: 1,
				members: [key(1, 0, holds ? viewer : undefined)],
			},
		});
		const order = (signerAddress: string | null) =>
			countSignerSets(
				{ signatures: [], accountAddress: '0x1' },
				[
					set('0x2', false),
					set('0x3', true),
					set('0x1', true),
				],
				signerAddress,
			).map((counted) => counted.address);

		expect(order(viewer.toSuiAddress())).toEqual([
			'0x1',
			'0x3',
			'0x2',
		]);
		expect(order(null)).toEqual(['0x2', '0x3', '0x1']);
	});

	it('counts no signer set that is not an alias of the pod', () => {
		const proposer = new Ed25519Keypair();
		const current = listedSet(
			signerSet([new Ed25519Keypair()]),
		);
		const stranger = listedSet(signerSet([proposer]));
		const proposal = v1Proposal({
			digest: DIGEST,
			ready: true,
			proposerAddress: proposer.toSuiAddress(),
			signatures: [
				{
					publicKey: stranger.members[0].publicKey,
					signature: 'sig',
				},
			],
			signerSets: [current, stranger],
		});

		const counted = toProposalCardInput(
			proposal,
			{ kind: 'read', aliases: [current.address] },
			proposer.toSuiAddress(),
		);
		expect(
			counted.checkedSignerSets.map((set) => set.address),
		).toEqual([current.address]);
		expect(proposalStatusKey(counted)).toBe('pending');
	});

	it('counts an executed change against the set its bytes removed, which is no alias any more, and a cancelled one not', async () => {
		const old = {
			threshold: 1,
			members: [key(1, 0), key(1, 1)],
		};
		const { pod, bytes } = await signerChange(old, {
			threshold: 1,
			members: [key(1, 0)],
		});
		const counted = (status: Proposal['status']) =>
			toProposalCardInput(
				v1Proposal({
					digest: DIGEST,
					accountAddress: pod,
					kind: 'signer_change',
					status,
					ready: true,
					transactionBytes: bytes,
					proposerAddress: pod,
					signerSets: [listedSet({ ...old, address: pod })],
				}),
				{ kind: 'read', aliases: ['0x2'] },
				null,
			);
		expect(
			counted('SUCCESS').checkedSignerSets.map(
				(set) => set.address,
			),
		).toEqual([pod]);
		expect(counted('CANCELLED').checkedSignerSets).toEqual(
			[],
		);
	});

	it('counts a pending change only against the set it replaces, not a second acting set', async () => {
		const old = {
			threshold: 2,
			members: [key(1, 0), key(1, 1)],
		};
		const second = listedSet(
			signerSet([new Ed25519Keypair()]),
		);
		const { pod, bytes } = await signerChange(
			old,
			{ threshold: 1, members: [key(1, 0)] },
			[second],
		);
		const counted = toProposalCardInput(
			v1Proposal({
				digest: DIGEST,
				accountAddress: pod,
				kind: 'signer_change',
				transactionBytes: bytes,
				proposerAddress: pod,
				signatures: [
					{
						publicKey: second.members[0].publicKey,
						signature: 'sig',
					},
				],
				signerSets: [
					listedSet({ ...old, address: pod }),
					second,
				],
			}),
			{ kind: 'read', aliases: [pod, second.address] },
			null,
		);
		expect(
			counted.checkedSignerSets.map((set) => set.address),
		).toEqual([pod]);
		expect(proposalStatusKey(counted)).toBe('pending');
	});
});

// Rows named by these ids, created in their order, for the merge helpers.
const ids = (...list: number[]) =>
	list.map((id) => ({
		id,
		createdAt: new Date(id * 1000).toISOString(),
	}));

describe('rowExecuteSet', () => {
	it('is the ready set, and none for a proposal that calls the alias module', async () => {
		const member = {
			publicKey: new Ed25519Keypair()
				.getPublicKey()
				.toSuiPublicKey(),
			weight: 1,
			order: 0,
		};
		const checkedSignerSets = countSignerSets(
			{
				signatures: [
					{ publicKey: member.publicKey, signature: 'sig' },
				],
				accountAddress: '0x1',
			},
			[
				{
					set: { threshold: 1, members: [member] },
					address: '0x1',
				},
			],
			null,
		);
		const aliasCall = Transaction.from(await transfer());
		aliasCall.moveCall({
			target: '0x2::address_alias::enable',
		});

		expect(
			rowExecuteSet({
				checkedSignerSets,
				transactionBytes: await transfer(),
			}),
		).toBe(checkedSignerSets[0]);
		expect(
			rowExecuteSet({
				checkedSignerSets,
				transactionBytes: toBase64(await aliasCall.build()),
			}),
		).toBeNull();
	});
});

describe('enablesSignerChanges', () => {
	it('holds only for bytes that are nothing but enable calls', async () => {
		const withCalls = async (...functions: string[]) => {
			const tx = Transaction.from(await transfer());
			for (const fn of functions)
				tx.moveCall({
					target: `0x2::address_alias::${fn}`,
				});
			return toBase64(await tx.build());
		};
		// The same enable call without the transfer.
		const enableOnly = TransactionDataBuilder.fromBytes(
			fromBase64(await withCalls('enable')),
		);
		enableOnly.commands.shift();
		expect(enablesSignerChanges(await transfer())).toBe(
			false,
		);
		expect(
			enablesSignerChanges(toBase64(enableOnly.build())),
		).toBe(true);
		expect(
			enablesSignerChanges(await withCalls('enable')),
		).toBe(false);
		expect(
			enablesSignerChanges(
				await withCalls('enable', 'remove'),
			),
		).toBe(false);
	});
});

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
