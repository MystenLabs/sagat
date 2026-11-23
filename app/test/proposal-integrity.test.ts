// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import {
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import {
	fromBase64,
	toBase58,
	toBase64,
} from '@mysten/sui/utils';
import { expect, test } from 'vitest';

import { type AliasRead } from '../src/lib/alias-set';
import {
	checkActingSets,
	checkProposalIntegrity,
	checkSignerOnNetwork,
	podActing,
	rebuildAccount,
	shownActingSets,
	type NodeFacts,
} from '../src/lib/proposal-integrity';

function oneOfTwoAccount() {
	const keys = [new Ed25519Keypair(), new Ed25519Keypair()];
	const threshold = 1;
	const address = MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: keys.map((key) => ({
			publicKey: key.getPublicKey(),
			weight: 1,
		})),
	}).toSuiAddress();
	const multisig = {
		address,
		threshold,
		members: keys.map((key, order) => ({
			publicKey: key.getPublicKey().toSuiPublicKey(),
			weight: 1,
			order,
		})),
	};
	return { keys, address, multisig };
}

test('refuses a wallet that is not one of the signers', async () => {
	const { address, multisig } = oneOfTwoAccount();

	const tx = new Transaction();
	tx.setSender(address);
	tx.setGasPayment([
		{
			objectId: '0x2',
			version: '1',
			digest: toBase58(new Uint8Array(32)),
		},
	]);
	tx.setGasPrice(1000);
	tx.setGasBudget(10_000_000);
	tx.transferObjects([tx.gas], '0x3');
	const transactionBytes = toBase64(await tx.build());
	const digest = TransactionDataBuilder.getDigestFromBytes(
		fromBase64(transactionBytes),
	);

	expect(
		checkProposalIntegrity(
			{
				transactionBytes,
				digest,
				multisigAddress: address,
				multisig,
			},
			{
				openedDigest: digest,
				signerAddress: new Ed25519Keypair().toSuiAddress(),
			},
		),
	).toBe('notSigner');
});

test("refuses bytes that don't decode as a transaction", () => {
	const { keys, address, multisig } = oneOfTwoAccount();
	const transactionBytes = toBase64(
		new Uint8Array([1, 2, 3]),
	);

	expect(
		checkProposalIntegrity(
			{
				transactionBytes,
				digest: toBase58(new Uint8Array(32)),
				multisigAddress: address,
				multisig,
			},
			{
				openedDigest: toBase58(new Uint8Array(32)),
				signerAddress: keys[0].toSuiAddress(),
			},
		),
	).toBe('unreadable');
});

test('a pod that never changed passes both rules as one check', () => {
	const { address, multisig } = oneOfTwoAccount();

	expect(rebuildAccount(multisig, address)).toBe(address);
	expect(
		checkActingSets([multisig], {
			kind: 'read',
			aliases: [address],
		}),
	).toEqual({
		kind: 'checked',
		acting: [{ set: multisig, address }],
		refused: [],
		unidentified: [],
	});
});

test('rule 1 refuses signers that do not rebuild the address, with no alias read', () => {
	const { address } = oneOfTwoAccount();
	const other = oneOfTwoAccount();

	expect(
		rebuildAccount(other.multisig, address),
	).toBeNull();
});

test('rule 2 refuses a pod whose own address is not in its alias set', () => {
	const { address, multisig } = oneOfTwoAccount();
	const other = oneOfTwoAccount();

	expect(rebuildAccount(multisig, address)).toBe(address);
	expect(
		checkActingSets([multisig], {
			kind: 'read',
			aliases: [other.address],
		}),
	).toMatchObject({ acting: [], refused: [multisig] });
});

test('an alias no shown set rebuilds is unidentified, and the pod still passes', () => {
	const { address, multisig } = oneOfTwoAccount();
	const other = oneOfTwoAccount();

	expect(
		checkActingSets([multisig], {
			kind: 'read',
			aliases: [address, other.address],
		}),
	).toMatchObject({
		acting: [{ set: multisig, address }],
		refused: [],
		unidentified: [other.address],
	});
});

test('an unread alias set leaves rule 2 unchecked', () => {
	const { multisig } = oneOfTwoAccount();

	expect(
		checkActingSets([multisig], { kind: 'failed' }),
	).toEqual({ kind: 'unchecked' });
});

test('of two shown sets, only the one that is an alias acts', () => {
	const { address } = oneOfTwoAccount();
	const current = oneOfTwoAccount();
	const stranger = oneOfTwoAccount();

	const shown = [current.multisig, stranger.multisig];
	const aliases: AliasRead = {
		kind: 'read',
		aliases: [address, current.address],
	};
	expect(checkActingSets(shown, aliases)).toEqual({
		kind: 'checked',
		acting: [
			{ set: current.multisig, address: current.address },
		],
		refused: [stranger.multisig],
		unidentified: [address],
	});
	expect(
		podActing(
			shown,
			aliases,
			current.keys[0].toSuiAddress(),
		),
	).toEqual({
		state: 'ok',
		signerSets: [current.multisig],
		unidentified: [address],
	});
	expect(
		podActing(
			shown,
			aliases,
			stranger.keys[0].toSuiAddress(),
		).state,
	).toBe('refused');
});

test('the original set acts when the node lists the pod’s own address, though the API leaves it out', () => {
	const { address, keys, multisig } = oneOfTwoAccount();
	const current = oneOfTwoAccount();
	const withAnswers = (set: typeof multisig) => ({
		...set,
		members: set.members.map((m) => ({
			...m,
			answer: 'accepted' as const,
			label: null,
		})),
	});
	const pod = {
		address,
		originalSignerSet: withAnswers(multisig),
		signerSets: [
			{
				kind: 'signer_set' as const,
				...withAnswers(current.multisig),
			},
		],
	};

	const acting = podActing(
		shownActingSets(pod),
		{ kind: 'read', aliases: [address, current.address] },
		keys[0].toSuiAddress(),
	);
	expect(acting.state).toBe('ok');
	expect(
		acting.signerSets.map((set) => set.address),
	).toEqual([current.address, address]);
	expect(acting.unidentified).toEqual([]);
});

const CHAIN = toBase58(new Uint8Array(32).fill(1));
const OTHER_CHAIN = toBase58(new Uint8Array(32).fill(2));

function signOnNetwork(
	shown: ReturnType<typeof oneOfTwoAccount>['multisig'][],
	signer: Ed25519Keypair,
	node: NodeFacts,
	namedChain: string | null = null,
) {
	return checkSignerOnNetwork({
		shown,
		signerAddress: signer.toSuiAddress(),
		namedChain,
		node,
	});
}

test('a member of a pod that never changed may sign on the network', () => {
	const { keys, address, multisig } = oneOfTwoAccount();

	expect(
		signOnNetwork([multisig], keys[0], {
			aliases: { kind: 'read', aliases: [address] },
			chain: CHAIN,
		}),
	).toBeNull();
});

test('a member may not sign once the pod’s address is not in its alias set', () => {
	const { keys, multisig } = oneOfTwoAccount();
	const other = oneOfTwoAccount();

	expect(
		signOnNetwork([multisig], keys[0], {
			aliases: { kind: 'read', aliases: [other.address] },
			chain: CHAIN,
		}),
	).toBe('notActing');
});

test('a key only in a shown set that is no alias may not sign, though another shown set is one', () => {
	const current = oneOfTwoAccount();
	const stranger = oneOfTwoAccount();

	expect(
		signOnNetwork(
			[current.multisig, stranger.multisig],
			stranger.keys[0],
			{
				aliases: {
					kind: 'read',
					aliases: [current.address],
				},
				chain: CHAIN,
			},
		),
	).toBe('notActing');
});

test('an unread alias set leaves signing unchecked', () => {
	const { keys, multisig } = oneOfTwoAccount();

	expect(
		signOnNetwork([multisig], keys[0], {
			aliases: { kind: 'failed' },
			chain: CHAIN,
		}),
	).toBe('unchecked');
});

test('bytes that name a chain must name the node’s', () => {
	const { keys, address, multisig } = oneOfTwoAccount();
	const aliases: AliasRead = {
		kind: 'read',
		aliases: [address],
	};

	expect(
		signOnNetwork(
			[multisig],
			keys[0],
			{ aliases, chain: CHAIN },
			CHAIN,
		),
	).toBeNull();
	expect(
		signOnNetwork(
			[multisig],
			keys[0],
			{ aliases, chain: CHAIN },
			OTHER_CHAIN,
		),
	).toBe('chain');
	expect(
		signOnNetwork(
			[multisig],
			keys[0],
			{ aliases, chain: null },
			CHAIN,
		),
	).toBe('unchecked');
	expect(
		signOnNetwork([multisig], keys[0], {
			aliases,
			chain: null,
		}),
	).toBeNull();
});

test('bytes naming another chain are refused even when the alias set is unread', () => {
	const { keys, multisig } = oneOfTwoAccount();

	expect(
		signOnNetwork(
			[multisig],
			keys[0],
			{ aliases: { kind: 'failed' }, chain: CHAIN },
			OTHER_CHAIN,
		),
	).toBe('chain');
});
