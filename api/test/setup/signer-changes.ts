// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	buildEnable,
	buildSignerChange,
	type Composition,
} from '@mysten/sagat';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';

import { fetchAliasSet } from '../../src/utils/aliases';
import { parsePublicKey } from '../../src/utils/pubKey';
import {
	newUser,
	sendCoins,
	signedBy,
	type TestSession,
	type TestUser,
} from '../framework/api-test-framework';
import {
	build,
	type GasCoin,
} from './localnet-transactions';
import { getLocalClient } from './sui-network';

const client = getLocalClient();

// A composition of the users' keys, in order, each of weight 1 unless given.
export const compositionOf = (
	members: TestUser[],
	threshold: number,
	weights: number[] = members.map(() => 1),
): Composition => ({
	threshold,
	members: members.map((member, i) => ({
		publicKey: member.publicKey,
		weight: weights[i],
	})),
});

// The address a composition rebuilds.
export const addressOf = (composition: Composition) =>
	MultiSigPublicKey.fromPublicKeys({
		threshold: composition.threshold,
		publicKeys: composition.members.map((m) => ({
			publicKey: parsePublicKey(m.publicKey),
			weight: m.weight,
		})),
	}).toSuiAddress();

// Sends the account `count` coins and returns them, so proposals pending together each have their own gas.
export const gasCoins = async (
	address: string,
	count: number,
): Promise<GasCoin[]> => {
	await sendCoins(address, count);
	const { objects } = await client.listCoins({
		owner: address,
	});
	return objects
		.slice(0, count)
		.map(({ objectId, version, digest }) => ({
			objectId,
			version,
			digest,
		}));
};

// Enables signer changes: `enable` proposed by the first voter, signed by the others, executed and verified.
export const enableSignerChanges = async (
	session: TestSession,
	account: string,
	voters: TestUser[],
	gasCoin?: GasCoin,
) => {
	const created = await session.createProposal(
		voters[0],
		account,
		'localnet',
		toBase64(await build(account, buildEnable, gasCoin)),
	);
	await session.voteAndExecute(
		voters.slice(1),
		created.digest,
	);
};

// Proposes a signer change through `/v1`, with labels for its new keys when given.
export const proposeChange = async (
	session: TestSession,
	proposer: TestUser,
	account: string,
	transactionBytes: string,
	labels?: (string | null)[],
) =>
	session.v1.createProposal({
		accountAddress: account,
		network: 'localnet',
		transactionBytes,
		signature: await signedBy(proposer, transactionBytes),
		labels,
	});

/**
 * The design's cast: account `A` with `S1` = 2-of-3 of `k1`, `k2`, `k3`,
 * funded; `S2` = `k1`, `k2`, `k4`; `S3` = 3-of-3 of `S1`'s keys. Keys in
 * `unaccepted` never accept `A`. Signer changes are enabled unless `enable` is false.
 */
export const createCast = async (
	session: TestSession,
	{
		unaccepted = [],
		enable = true,
	}: { unaccepted?: number[]; enable?: boolean } = {},
) => {
	const [k1, k2, k3, k4] = Array.from(
		{ length: 4 },
		newUser,
	);
	for (const [i, key] of [k1, k2, k3].entries())
		if (!unaccepted.includes(i + 1))
			await session.connectUser(key);
	const { address: A } = await session.createMultisig(
		[k1, k2, k3],
		2,
		{ fund: true },
	);
	if (enable)
		await enableSignerChanges(session, A, [k1, k2]);
	return {
		k1,
		k2,
		k3,
		k4,
		A,
		S1: compositionOf([k1, k2, k3], 2),
		S2: compositionOf([k1, k2, k4], 2),
		S3: compositionOf([k1, k2, k3], 3),
	};
};

export type Cast = Awaited<ReturnType<typeof createCast>>;

type CastChangeOptions = {
	// `A` and `[S1]` unless given.
	oldSet?: string;
	known?: Composition[];
	gasCoin?: GasCoin;
	epoch?: bigint;
};

// The cast's change to `newSet`, from `S1` unless `oldSet` is given, built with the SDK against the alias set on chain, at the local epoch or `epoch`.
export const buildCastChange = async (
	{ A: account, S1 }: Cast,
	newSet: Composition,
	{
		oldSet = account,
		known = [S1],
		gasCoin,
		epoch,
	}: CastChangeOptions = {},
) => {
	const [
		{ aliases },
		{ chainIdentifier },
		{ systemState },
	] = await Promise.all([
		fetchAliasSet(client, account),
		client.core.getChainIdentifier(),
		client.core.getCurrentSystemState(),
	]);
	const bytes = toBase64(
		await build(
			account,
			(tx) =>
				buildSignerChange(tx, {
					account,
					aliases,
					oldSet,
					newSet,
					known,
					chain: chainIdentifier,
					epoch: systemState.epoch,
				}),
			gasCoin,
		),
	);
	if (epoch === undefined) return bytes;
	// The node resolves no expired transaction, so the epochs are set on the resolved one.
	const tx = Transaction.from(bytes);
	const { ValidDuring } = tx.getData().expiration!;
	tx.setExpiration({
		ValidDuring: {
			...ValidDuring!,
			minEpoch: String(epoch),
			maxEpoch: String(epoch + 1n),
		},
	});
	return toBase64(await tx.build());
};

// The cast's change to `newSet`, proposed by `k1` through `/v1`.
export const proposeCastChange = async (
	session: TestSession,
	cast: Cast,
	newSet: Composition,
	{
		labels,
		...options
	}: CastChangeOptions & {
		labels?: (string | null)[];
	} = {},
) =>
	proposeChange(
		session,
		cast.k1,
		cast.A,
		await buildCastChange(cast, newSet, options),
		labels,
	);
