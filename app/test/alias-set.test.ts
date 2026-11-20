// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	AddressAliasesBcs,
	deriveAliasesObjectId,
	type AliasObjectEntry,
} from '@mysten/sagat';
import { ObjectError } from '@mysten/sui/client';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
	normalizeSuiAddress,
	toBase58,
} from '@mysten/sui/utils';
import {
	QueryClient,
	QueryObserver,
} from '@tanstack/react-query';
import { expect, test } from 'vitest';

import {
	aliasSetsKey,
	podAliasSetQuery,
} from '../src/hooks/useAliasSets';
import {
	aliasReadsFromEntries,
	podsToRead,
	readAliasSets,
	readChainIdentifier,
	withPodRead,
	type AliasRead,
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

test('sends each valid pod to the node once, normalized, and no invalid address', () => {
	const pod = new Ed25519Keypair().toSuiAddress();

	expect(
		podsToRead([
			'0xA1',
			'not an address',
			normalizeSuiAddress('0xa1'),
			pod,
		]),
	).toEqual([normalizeSuiAddress('0xa1'), pod]);
});

test('an unreachable node fails every pod, with an entry for an invalid address too', async () => {
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

test('keys a pod asked for twice once, by its normalized address', async () => {
	const reads = await readAliasSets(unreachable, [
		'0xA1',
		normalizeSuiAddress('0xa1'),
	]);

	expect([...reads.keys()]).toEqual([
		normalizeSuiAddress('0xa1'),
	]);
});

test('a fresh read of a pod replaces only its own entry in a cached read', () => {
	const [pod, other] = [
		new Ed25519Keypair().toSuiAddress(),
		new Ed25519Keypair().toSuiAddress(),
	];
	const otherRead: AliasRead = {
		kind: 'read',
		aliases: [other],
	};
	const cached = new Map<string, AliasRead>([
		[pod, { kind: 'read', aliases: [pod] }],
		[other, otherRead],
	]);

	const updated = withPodRead(cached, pod, {
		kind: 'failed',
	});

	expect(updated.get(pod)).toEqual({ kind: 'failed' });
	expect(updated.get(other)).toBe(otherRead);
	expect(cached.get(pod)).toEqual({
		kind: 'read',
		aliases: [pod],
	});
});

test('a fresh read of a pod leaves a cached read without it untouched', () => {
	const other = new Ed25519Keypair().toSuiAddress();
	const cached = new Map<string, AliasRead>([
		[other, { kind: 'read', aliases: [other] }],
	]);

	expect(
		withPodRead(
			cached,
			new Ed25519Keypair().toSuiAddress(),
			{
				kind: 'failed',
			},
		),
	).toBe(cached);
});

/** A batched read whose responses the test hands out, one per fetch, in order. */
function heldBatch() {
	const pending: ((
		reads: Map<string, AliasRead>,
	) => void)[] = [];
	return {
		queryFn: () =>
			new Promise<Map<string, AliasRead>>((resolve) => {
				pending.push(resolve);
			}),
		respond: (reads: Map<string, AliasRead>) =>
			pending.shift()?.(reads),
	};
}

const settle = () =>
	new Promise((resolve) => setTimeout(resolve, 0));

test('an older batched response landing after a fresh read of a pod keeps the fresh read', async () => {
	const queryClient = new QueryClient();
	const [pod, other] = [
		new Ed25519Keypair().toSuiAddress(),
		new Ed25519Keypair().toSuiAddress(),
	].sort();
	const before = new Map<string, AliasRead>([
		[pod, { kind: 'read', aliases: [pod] }],
		[other, { kind: 'read', aliases: [other] }],
	]);
	const fresh: AliasRead = {
		kind: 'read',
		aliases: [new Ed25519Keypair().toSuiAddress()],
	};
	const batch = heldBatch();
	const queryKey = aliasSetsKey('localnet', [pod, other]);
	const first = queryClient.fetchQuery({
		queryKey,
		queryFn: batch.queryFn,
	});
	batch.respond(before);
	await first;
	void queryClient.refetchQueries({ queryKey });
	await settle();

	await queryClient.fetchQuery(
		podAliasSetQuery(
			queryClient,
			'localnet',
			pod,
			async () => fresh,
		),
	);
	batch.respond(before);
	await settle();

	const cached =
		queryClient.getQueryData<Map<string, AliasRead>>(
			queryKey,
		);
	expect(cached?.get(pod)).toEqual(fresh);
	expect(cached?.get(other)).toEqual(before.get(other));
});

test('a batched read on its first fetch ends with a fresh read of a pod that lands meanwhile', async () => {
	const queryClient = new QueryClient();
	const [pod, other] = [
		new Ed25519Keypair().toSuiAddress(),
		new Ed25519Keypair().toSuiAddress(),
	].sort();
	const fresh: AliasRead = {
		kind: 'read',
		aliases: [new Ed25519Keypair().toSuiAddress()],
	};
	const batch = heldBatch();
	const queryKey = aliasSetsKey('localnet', [pod, other]);
	// Observed, as every batched read in the app is.
	const stop = new QueryObserver(queryClient, {
		queryKey,
		queryFn: batch.queryFn,
		retry: false,
	}).subscribe(() => {});
	await settle();

	await queryClient.fetchQuery(
		podAliasSetQuery(
			queryClient,
			'localnet',
			pod,
			async () => fresh,
		),
	);
	batch.respond(
		new Map([
			[pod, { kind: 'read', aliases: [pod] }],
			[other, { kind: 'read', aliases: [other] }],
		]),
	);
	batch.respond(
		new Map([
			[pod, fresh],
			[other, { kind: 'read', aliases: [other] }],
		]),
	);
	await settle();

	expect(
		queryClient
			.getQueryData<Map<string, AliasRead>>(queryKey)
			?.get(pod),
	).toEqual(fresh);
	stop();
});

test('reads no chain identifier from an unreachable node', async () => {
	expect(await readChainIdentifier(unreachable)).toBeNull();
});
