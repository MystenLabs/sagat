// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	AddressAliasesBcs,
	deriveAliasesObjectId,
} from '@mysten/sagat';
import { ObjectError } from '@mysten/sui/client';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
	normalizeSuiAddress,
	toBase58,
} from '@mysten/sui/utils';
import { expect, test } from 'vitest';

import {
	aliasReadsFromEntries,
	readAliasSets,
	readChainIdentifier,
	type AliasObjectEntry,
} from '../src/lib/alias-set';

// Nothing listens on the discard port.
const unreachable = new SuiGrpcClient({
	network: 'localnet',
	baseUrl: 'http://127.0.0.1:9',
});

const notFound = (pod: string) =>
	new ObjectError('notFound', 'Object not found', {
		reason: 'notFound',
		objectId: deriveAliasesObjectId(pod),
	});

function aliasesObject(
	pod: string,
	aliases: string[],
	type = '0x2::address_alias::AddressAliases',
): AliasObjectEntry {
	const objectId = deriveAliasesObjectId(pod);
	return {
		objectId,
		version: '7',
		digest: toBase58(new Uint8Array(32)),
		owner: {
			$kind: 'Shared',
			Shared: { initialSharedVersion: '5' },
		},
		type,
		content: AddressAliasesBcs.serialize({
			id: objectId,
			aliases: { contents: aliases },
		}).toBytes() as Uint8Array<ArrayBuffer>,
		previousTransaction: toBase58(
			new Uint8Array(32).fill(1),
		),
		objectBcs: undefined,
		json: undefined,
		display: undefined,
	};
}

test('a pod with no alias object has itself as its alias set', () => {
	const pod = new Ed25519Keypair().toSuiAddress();

	expect(
		aliasReadsFromEntries([pod], [notFound(pod)]).get(pod),
	).toEqual({ kind: 'read', aliases: [pod] });
});

test('reads both aliases of an alias object, normalized', () => {
	const pod = new Ed25519Keypair().toSuiAddress();

	expect(
		aliasReadsFromEntries(
			[pod],
			[aliasesObject(pod, [pod, '0xA1'])],
		).get(pod),
	).toEqual({
		kind: 'read',
		aliases: [pod, normalizeSuiAddress('0xa1')],
	});
});

test('an entry that does not decode fails only its own pod', () => {
	const pods = [
		new Ed25519Keypair().toSuiAddress(),
		new Ed25519Keypair().toSuiAddress(),
	];

	const reads = aliasReadsFromEntries(pods, [
		aliasesObject(pods[0], [pods[0]], '0x2::coin::Coin'),
		notFound(pods[1]),
	]);

	expect(reads.get(pods[0])).toEqual({ kind: 'failed' });
	expect(reads.get(pods[1])).toEqual({
		kind: 'read',
		aliases: [pods[1]],
	});
});

test('an unreachable node fails every pod, and an invalid address too', async () => {
	const pods = [
		new Ed25519Keypair().toSuiAddress(),
		new Ed25519Keypair().toSuiAddress(),
	];

	const reads = await readAliasSets(unreachable, [
		...pods,
		'not an address',
	]);

	expect([...reads.values()]).toEqual([
		{ kind: 'failed' },
		{ kind: 'failed' },
		{ kind: 'failed' },
	]);
	expect(reads.get(pods[0])).toEqual({ kind: 'failed' });
});

test('reads a pod asked for twice once, keyed by its normalized address', async () => {
	const reads = await readAliasSets(unreachable, [
		'0xA1',
		normalizeSuiAddress('0xa1'),
	]);

	expect([...reads.keys()]).toEqual([
		normalizeSuiAddress('0xa1'),
	]);
});

test('reads no chain identifier from an unreachable node', async () => {
	expect(await readChainIdentifier(unreachable)).toBeNull();
});
