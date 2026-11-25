// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import {
	Inputs,
	Transaction,
} from '@mysten/sui/transactions';
import {
	fromBase64,
	normalizeSuiAddress,
	toBase58,
} from '@mysten/sui/utils';
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';
import { describe, expect, test } from 'bun:test';

import {
	buildAdd,
	buildRemove,
	buildSignerChange,
	checkSignerChange,
	compositionNote,
	deriveAliasesObjectId,
	findAliasCalls,
	isProofMet,
	MAX_ALIASES,
	namedChain,
	proofWeight,
	readCompositionNote,
	SignerChangeError,
	signerChangeProof,
	signersWhoStay,
	type Composition,
	type SignerSetEntry,
} from '../src/index.js';
import type {
	SignerChangeErrorReason,
	SignerChangeInput,
} from '../src/signer-change.js';

const [k1, k2, k3, k4, k5] = Array.from({ length: 5 }, () =>
	new Ed25519Keypair().getPublicKey().toSuiPublicKey(),
);

const composition = (
	threshold: number,
	members: [string, number][],
): Composition => ({
	threshold,
	members: members.map(([publicKey, weight]) => ({
		publicKey,
		weight,
	})),
});

const addressOf = (c: Composition) =>
	MultiSigPublicKey.fromPublicKeys({
		threshold: c.threshold,
		publicKeys: c.members.map((m) => ({
			publicKey: publicKeyFromSuiBytes(m.publicKey),
			weight: m.weight,
		})),
	}).toSuiAddress();

const entryOf = (c: Composition): SignerSetEntry => ({
	type: 'signer_set',
	version: 1,
	address: addressOf(c),
	threshold: c.threshold,
	members: c.members.map((m) => ({ ...m })),
});

// S1 is the account's original set; S2 replaces k3 with k4 at new weights.
const S1 = composition(2, [
	[k1, 1],
	[k2, 1],
	[k3, 1],
]);
const S2 = composition(3, [
	[k1, 2],
	[k2, 1],
	[k4, 1],
]);
const S3 = composition(3, [
	[k1, 1],
	[k2, 1],
	[k3, 1],
]);
const A = addressOf(S1);
const K = new Ed25519Keypair();
const U = new Ed25519Keypair().toSuiAddress();
const chain = toBase58(new Uint8Array(32).fill(7));

// A transaction of A's, ready to build offline.
function accountTransaction(sender = A) {
	const tx = new Transaction();
	tx.setSender(sender);
	tx.setGasPrice(1000);
	tx.setGasBudget(10_000_000);
	tx.setGasPayment([
		{
			objectId: normalizeSuiAddress('0x99'),
			version: '1',
			digest: toBase58(new Uint8Array(32).fill(1)),
		},
	]);
	tx.object(
		Inputs.SharedObjectRef({
			objectId: deriveAliasesObjectId(A),
			initialSharedVersion: 1,
			mutable: true,
		}),
	);
	return tx;
}

const change = (
	input: Partial<SignerChangeInput> = {},
	sender = A,
) => {
	const tx = accountTransaction(sender);
	buildSignerChange(tx, {
		account: A,
		aliases: [A],
		oldSet: A,
		newSet: S2,
		known: [S1],
		chain,
		epoch: 5,
		...input,
	});
	return tx;
};

const fromBytes = async (tx: Transaction) =>
	Transaction.from(await tx.build()).getData();

// A transaction with A's alias calls and the given note texts.
function handWritten(
	calls: ['add' | 'remove', string][],
	texts: string[],
) {
	const tx = accountTransaction();
	for (const [fn, alias] of calls)
		(fn === 'add' ? buildAdd : buildRemove)(tx, {
			account: A,
			alias,
		});
	for (const text of texts) tx.pure.string(text);
	return tx;
}

function expectReason(
	run: () => unknown,
	reason: SignerChangeErrorReason,
) {
	let error: unknown;
	try {
		run();
	} catch (e) {
		error = e;
	}
	expect(error).toBeInstanceOf(SignerChangeError);
	expect((error as SignerChangeError).reason).toBe(reason);
}

describe('buildSignerChange', () => {
	test('adds the new set before removing the old one, with an expiration that names the chain', () => {
		const data = change().getData();

		expect(findAliasCalls(data)).toEqual([
			{ function: 'add', aliases: [addressOf(S2)] },
			{ function: 'remove', aliases: [A] },
		]);
		expect(data.expiration?.ValidDuring).toMatchObject({
			minEpoch: '5',
			maxEpoch: '6',
			chain,
		});
		expect(namedChain(data)).toBe(chain);
	});

	test('removes first when the alias set is full', () => {
		const fillers = Array.from(
			{ length: MAX_ALIASES - 1 },
			() => new Ed25519Keypair().toSuiAddress(),
		);

		expect(
			findAliasCalls(
				change({ aliases: [A, ...fillers] }).getData(),
			),
		).toEqual([
			{ function: 'remove', aliases: [A] },
			{ function: 'add', aliases: [addressOf(S2)] },
		]);
	});

	test('only removes when the new set is already an alias', () => {
		expect(
			findAliasCalls(
				change({ aliases: [A, addressOf(S2)] }).getData(),
			),
		).toEqual([{ function: 'remove', aliases: [A] }]);
	});

	test('refuses an old set outside the alias set, a new set equal to the old, and an old set it cannot describe', () => {
		expect(() => change({ oldSet: U })).toThrow(
			/not in the alias set/,
		);
		expect(() => change({ newSet: S1 })).toThrow(
			/equals the old one/,
		);
		expect(() => change({ known: [] })).toThrow(
			/is not known/,
		);
	});
});

describe('composition note', () => {
	test('round-trips through build and Transaction.from', async () => {
		const aliases = [A, K.toSuiAddress(), U];
		const tx = change({ aliases });
		const data = await fromBytes(tx);
		const after = [
			K.toSuiAddress(),
			U,
			addressOf(S2),
		].sort();

		const texts = compositionNote({
			account: A,
			before: aliases,
			after,
			known: [S2, S1],
		});
		expect(
			data.inputs
				.slice(-texts.length)
				.map((i) =>
					bcs.string().parse(fromBase64(i.Pure!.bytes)),
				),
		).toEqual(texts);

		const note = readCompositionNote(data);
		expect(note).toEqual({
			account: A,
			before: [...aliases].sort(),
			after,
			calls: [
				{ function: 'add', alias: addressOf(S2) },
				{ function: 'remove', alias: A },
			],
			signerSets: [...aliases, addressOf(S2)]
				.sort()
				.map((address) =>
					address === A
						? entryOf(S1)
						: address === addressOf(S2)
							? entryOf(S2)
							: {
									type: 'other_signer_set',
									version: 1,
									address,
								},
				),
			removed: entryOf(S1),
			added: entryOf(S2),
		});

		const checked = checkSignerChange(data, aliases);
		expect(checked.oldSet).toEqual(entryOf(S1));
		expect(checked.newSets).toEqual([entryOf(S2)]);
		expect(checked.after).toEqual(after);
	});

	test('a transaction without a note has none', () => {
		expect(
			readCompositionNote(
				handWritten([['add', addressOf(S2)]], []).getData(),
			),
		).toBeNull();
		expect(
			readCompositionNote(new Transaction().getData()),
		).toBeNull();
	});

	test('refuses a note whose account is not the sender', () => {
		expectReason(
			() =>
				readCompositionNote(
					change({}, addressOf(S3)).getData(),
				),
			'account',
		);
	});

	test('refuses a signer set that does not rebuild its address', () => {
		const texts = compositionNote({
			account: A,
			before: [A],
			after: [addressOf(S2)],
			known: [S1, S2],
		}).map((text) =>
			text.includes(addressOf(S2)) &&
			text.includes('signer_set')
				? text.replace('"threshold":3', '"threshold":2')
				: text,
		);
		expectReason(
			() =>
				readCompositionNote(
					handWritten(
						[
							['add', addressOf(S2)],
							['remove', A],
						],
						texts,
					).getData(),
				),
			'address',
		);
	});

	test('refuses an after that does not follow from the calls', () => {
		const tx = handWritten(
			[
				['add', addressOf(S2)],
				['remove', A],
			],
			compositionNote({
				account: A,
				before: [A],
				after: [A, addressOf(S2)],
				known: [S1, S2],
			}),
		);
		expectReason(
			() => checkSignerChange(tx.getData(), [A]),
			'after',
		);
	});

	test('refuses a stale before', () => {
		expectReason(
			() =>
				checkSignerChange(change().getData(), [
					A,
					K.toSuiAddress(),
				]),
			'before',
		);
	});

	test('refuses a note input that is not canonical', () => {
		const [first, ...rest] = compositionNote({
			account: A,
			before: [A],
			after: [addressOf(S2)],
			known: [S1, S2],
		});
		const calls: ['add' | 'remove', string][] = [
			['add', addressOf(S2)],
			['remove', A],
		];
		const reordered = first.replace(
			'"type":"signer_change","version":1',
			'"version":1,"type":"signer_change"',
		);
		const extra = first.replace('}', ',"label":"Ops"}');

		for (const text of [reordered, extra])
			expectReason(
				() =>
					readCompositionNote(
						handWritten(calls, [text, ...rest]).getData(),
					),
				'not_canonical',
			);
	});

	test('refuses another command next to the alias calls', () => {
		const tx = change();
		const [coin] = tx.splitCoins(tx.gas, [1]);
		tx.transferObjects([coin], U);

		expectReason(
			() => readCompositionNote(tx.getData()),
			'commands',
		);
	});
});

describe('signers who stay and the proof', () => {
	const old = entryOf(S1);
	const next = entryOf(S2);

	test('signers who stay are the old keys in the new set, and the proof counts them at their new weights, not a removed signer or a new one', () => {
		expect(signersWhoStay(old, next)).toEqual([k1, k2]);
		expect(proofWeight(old, next, [k1, k3, k4, k5])).toBe(
			2,
		);
	});

	test('the proof names the signers who stay that have not signed, until they reach the new threshold', () => {
		const toS2 = { oldSet: old, newSets: [next] };
		// One below S2's threshold of 3.
		expect(signerChangeProof(toS2, [k1, k3])).toEqual({
			met: false,
			notSigned: [k2],
		});
		expect(signerChangeProof(toS2, [k1, k2])).toEqual({
			met: true,
			notSigned: [],
		});
	});

	test('a change that only removes is proven by any set left', () => {
		const aliases = [A, addressOf(S2), addressOf(S3)];
		const checked = checkSignerChange(
			change({
				aliases,
				newSet: S3,
				known: [S1, S2],
			}).getData(),
			aliases,
		);
		expect(checked.newSets).toEqual(
			[entryOf(S2), entryOf(S3)].sort((a, b) =>
				a.address.localeCompare(b.address),
			),
		);

		expect(isProofMet(checked, [k2, k3])).toBe(false);
		// S2 alone reaches its threshold.
		expect(isProofMet(checked, [k1, k2])).toBe(true);
	});
});
