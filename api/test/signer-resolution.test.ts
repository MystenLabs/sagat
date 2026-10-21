// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The alias mirror and the signer resolver against a local network and
// Postgres (docs/account-rotation.md). The steps share state and run in order.

import type {
	ClientWithCoreApi,
	SuiClientTypes,
} from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { Transaction } from '@mysten/sui/transactions';
import {
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	spyOn,
	test,
} from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db';
import {
	SchemaAccountAliases,
	SchemaAccountAliasState,
	SchemaAccountProposers,
} from '../src/db/schema';
import {
	AliasStateUnavailableError,
	NotFoundError,
} from '../src/errors';
import {
	ACCESS_CHECK_MAX_AGE_MS,
	getMirroredAliases,
	refreshAliases,
} from '../src/services/aliases.service';
import {
	canSignFor,
	hasAccountAccess,
	isRotated,
	leafPublicKeys,
	proposalProgress,
	resolveValidSignerSets,
} from '../src/services/signer-resolution.service';
import {
	buildAdd,
	buildEnable,
	buildRemove,
} from '../src/utils/aliases';
import * as clientUtils from '../src/utils/client';
import {
	ApiTestFramework,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import {
	getLocalClient,
	LOCALNET_WAIT,
} from './setup/sui-network';

setupSharedTestEnvironment();
setDefaultTimeout(60_000);

const client = getLocalClient();
const NETWORK = 'localnet';

const include = {
	effects: true,
	transaction: true,
} as const;

async function execute(
	bytes: Uint8Array,
	signature: string,
) {
	const result = await client.executeTransaction({
		transaction: bytes,
		signatures: [signature],
		include,
	});
	await client.waitForTransaction({
		result,
		...LOCALNET_WAIT,
	});
	if (result.$kind !== 'Transaction') {
		throw new Error(
			`Expected success, got: ${JSON.stringify(result.FailedTransaction.status)}`,
		);
	}
	return result.Transaction as SuiClientTypes.Transaction<
		typeof include
	>;
}

function composition(
	members: TestUser[],
	threshold: number,
) {
	return MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: members.map((m) => ({
			publicKey: m.keypair.getPublicKey(),
			weight: 1,
		})),
	});
}

/** Build a transaction with `sender = account` and sign it with `signers` through `set`. */
async function run(
	account: string,
	set: MultiSigPublicKey,
	signers: TestUser[],
	fill: (tx: Transaction) => void,
) {
	const tx = new Transaction();
	tx.setSender(account);
	fill(tx);
	const bytes = await tx.build({ client });
	const partials = await Promise.all(
		signers.map(
			async (s) =>
				(await s.keypair.signTransaction(bytes)).signature,
		),
	);
	return execute(
		bytes,
		set.combinePartialSignatures(partials),
	);
}

const sorted = (values: string[]) => [...values].sort();

const stateOf = (account: string) =>
	and(
		eq(SchemaAccountAliasState.accountAddress, account),
		eq(SchemaAccountAliasState.network, NETWORK),
	);

/** Make the state of `account` on the test network older than the access check allows. */
const backdate = (account: string) =>
	db
		.update(SchemaAccountAliasState)
		.set({
			observedAt: new Date(
				Date.now() - ACCESS_CHECK_MAX_AGE_MS - 1_000,
			),
		})
		.where(stateOf(account));

const failingClient = {
	core: {
		getObjects: async () => {
			throw new Error('rpc unavailable');
		},
	},
} as unknown as ClientWithCoreApi;

describe('Signer resolution', () => {
	let framework: ApiTestFramework;
	let session: TestSession;
	let users: TestUser[];
	let u1: TestUser,
		u2: TestUser,
		u3: TestUser,
		u4: TestUser,
		u5: TestUser;

	// M: the account, 2-of-3 {u1, u2, u3}.
	let M: MultiSigPublicKey;
	let account: string;
	// M2: a new composition, 2-of-3 {u2, u3, u4}.
	let M2: MultiSigPublicKey;
	let m2: string;
	// K: a single key alias (u5, registered). X: an address Sagat never saw.
	let K: string;
	const X = new Ed25519Keypair().toSuiAddress();

	beforeAll(async () => {
		const app = await createTestApp();
		framework = new ApiTestFramework(app);
		({ session, users } =
			await framework.createAuthenticatedSession(5));
		await session.client.registerAddresses();
		[u1, u2, u3, u4, u5] = users;

		M = composition([u1, u2, u3], 2);
		M2 = composition([u2, u3, u4], 2);
		m2 = M2.toSuiAddress();
		K = u5.address;

		const created = await session.createMultisig(
			[u1, u2, u3],
			2,
			{ name: 'Account', fund: true },
		);
		account = created.address;
		expect(account).toBe(M.toSuiAddress());
		await session.acceptMultisig(u2, account);

		// Created through the legacy route, so it is also an account. Left
		// unverified until step 2.
		const created2 = await session.createMultisig(
			[u2, u3, u4],
			2,
			{ name: 'Board' },
		);
		expect(created2.address).toBe(m2);
	});

	test('1. an unknown state is refreshed on first use; no alias object resolves to the original composition', async () => {
		// Nothing has read the account's alias set yet.
		expect(
			await getMirroredAliases(account, NETWORK),
		).toEqual({
			aliases: [account],
			known: false,
			exists: false,
			observedAt: null,
			observedVersion: null,
		});

		// The first access check refreshes it: the object does not exist.
		expect(
			await canSignFor(u1.publicKey, account, NETWORK),
		).toBe(true);
		const mirror = await getMirroredAliases(
			account,
			NETWORK,
		);
		expect(mirror).toMatchObject({
			aliases: [account],
			known: true,
			exists: false,
			observedVersion: null,
		});
		// Written and read back in UTC, so the age check is meaningful.
		expect(
			Math.abs(mirror.observedAt!.getTime() - Date.now()),
		).toBeLessThan(ACCESS_CHECK_MAX_AGE_MS / 2);

		// M2 was never touched: unknown until an access check refreshes it.
		expect(await getMirroredAliases(m2, NETWORK)).toEqual({
			aliases: [m2],
			known: false,
			exists: false,
			observedAt: null,
			observedVersion: null,
		});
		expect(
			await canSignFor(u2.publicKey, m2, NETWORK),
		).toBe(true);
		expect(
			await getMirroredAliases(m2, NETWORK),
		).toMatchObject({
			aliases: [m2],
			known: true,
			exists: false,
		});

		const resolved = await resolveValidSignerSets(
			account,
			NETWORK,
		);
		expect(resolved.exists).toBe(false);
		expect(resolved.aliases).toHaveLength(1);
		expect(resolved.aliases[0]).toMatchObject({
			kind: 'signer_set',
			address: account,
			isVerified: true,
		});
		expect(
			resolved.signerSets.map((s) => s.address),
		).toEqual([account]);
		expect(resolved.signerSets[0].threshold).toBe(2);
		// The label comes from the account's link to its original composition.
		expect(resolved.signerSets[0].label).toBe('Account');
		expect(
			resolved.signerSets[0].members.map(
				(m) => m.publicKey,
			),
		).toEqual([u1.publicKey, u2.publicKey, u3.publicKey]);

		expect(
			sorted(await leafPublicKeys(account, NETWORK)),
		).toEqual(
			sorted([u1.publicKey, u2.publicKey, u3.publicKey]),
		);

		// Refreshing an account that never called `enable` changes nothing.
		expect(await refreshAliases(account, NETWORK)).toEqual({
			exists: false,
			version: null,
			aliases: [account],
			added: [],
			removed: [],
		});

		expect(await isRotated(account)).toBe(false);
		expect(
			await canSignFor(u1.publicKey, account, NETWORK),
		).toBe(true);
		expect(
			await canSignFor(
				u4.keypair.getPublicKey(),
				account,
				NETWORK,
			),
		).toBe(false);
		expect(
			await hasAccountAccess([u1.publicKey], account),
		).toBe(true);
		expect(
			await hasAccountAccess([u1.publicKey], account, {
				network: NETWORK,
			}),
		).toBe(true);
		expect(
			await hasAccountAccess([u4.publicKey], account),
		).toBe(false);
	});

	test('2. enable and add a second composition', async () => {
		const enabled = await run(
			account,
			M,
			[u1, u2],
			buildEnable,
		);
		expect(enabled.effects.status.success).toBe(true);

		// `enable` alone does not change the set: {account} is still the set.
		const afterEnable = await refreshAliases(
			account,
			NETWORK,
		);
		expect(afterEnable).toMatchObject({
			exists: true,
			aliases: [account],
			added: [],
			removed: [],
		});
		const mirrorAfterEnable = await getMirroredAliases(
			account,
			NETWORK,
		);
		expect(mirrorAfterEnable).toMatchObject({
			aliases: [account],
			known: true,
			exists: true,
			observedVersion: Number(afterEnable.version),
		});
		expect(await isRotated(account)).toBe(false);

		await run(account, M, [u1, u3], (tx) =>
			buildAdd(tx, { account, alias: m2 }),
		);

		const afterAdd = await refreshAliases(account, NETWORK);
		expect(afterAdd.exists).toBe(true);
		expect(afterAdd.aliases).toEqual([account, m2]);
		expect(afterAdd.added).toEqual([m2]);
		expect(afterAdd.removed).toEqual([]);
		expect(BigInt(afterAdd.version!)).toBeGreaterThan(
			BigInt(afterEnable.version!),
		);

		// Refreshing again is a no-op.
		expect(await refreshAliases(account, NETWORK)).toEqual({
			...afterAdd,
			added: [],
			removed: [],
		});

		const mirror = await getMirroredAliases(
			account,
			NETWORK,
		);
		expect(mirror.aliases).toEqual(sorted([account, m2]));
		expect(mirror.observedVersion).toBe(
			Number(afterAdd.version),
		);

		let resolved = await resolveValidSignerSets(
			account,
			NETWORK,
		);
		expect(
			resolved.aliases
				.map((a) => `${a.kind}:${a.address}`)
				.sort(),
		).toEqual(
			sorted([account, m2]).map((a) => `signer_set:${a}`),
		);
		expect(
			resolved.aliases.find((a) => a.address === m2),
		).toMatchObject({
			kind: 'signer_set',
			isVerified: false,
		});

		// Verifying the set is reflected on the next resolve.
		await session.acceptMultisig(u4, m2);
		resolved = await resolveValidSignerSets(
			account,
			NETWORK,
		);
		expect(
			resolved.aliases.find((a) => a.address === m2),
		).toMatchObject({
			kind: 'signer_set',
			isVerified: true,
		});
		expect(resolved.signerSets).toHaveLength(2);

		expect(
			sorted(await leafPublicKeys(account, NETWORK)),
		).toEqual(
			sorted([
				u1.publicKey,
				u2.publicKey,
				u3.publicKey,
				u4.publicKey,
			]),
		);
		expect(
			await canSignFor(u4.publicKey, account, NETWORK),
		).toBe(true);
		expect(
			await hasAccountAccess([u4.publicKey], account),
		).toBe(true);
		expect(await isRotated(account)).toBe(true);
	});

	test('3. a single key alias and an unknown alias', async () => {
		// Signed by the second composition.
		await run(account, M2, [u3, u4], (tx) => {
			buildAdd(tx, { account, alias: K });
			buildAdd(tx, { account, alias: X });
		});

		const refreshed = await refreshAliases(
			account,
			NETWORK,
		);
		expect(refreshed.aliases).toEqual([account, m2, K, X]);
		expect(refreshed.added).toEqual([K, X]);
		expect(refreshed.removed).toEqual([]);

		const { aliases, signerSets } =
			await resolveValidSignerSets(account, NETWORK);
		expect(aliases.find((a) => a.address === K)).toEqual({
			kind: 'key',
			address: K,
			publicKey: u5.publicKey,
		});
		expect(aliases.find((a) => a.address === X)).toEqual({
			kind: 'unknown',
			address: X,
		});
		expect(signerSets.map((s) => s.address).sort()).toEqual(
			sorted([account, m2]),
		);

		expect(
			sorted(await leafPublicKeys(account, NETWORK)),
		).toEqual(
			sorted([
				u1.publicKey,
				u2.publicKey,
				u3.publicKey,
				u4.publicKey,
				u5.publicKey,
			]),
		);
		expect(
			await canSignFor(u5.publicKey, account, NETWORK),
		).toBe(true);

		// Proposers have access without being a leaf.
		const proposer = new Ed25519Keypair();
		const proposerKey = proposer
			.getPublicKey()
			.toSuiPublicKey();
		expect(
			await hasAccountAccess([proposerKey], account),
		).toBe(false);
		await db.insert(SchemaAccountProposers).values({
			accountAddress: account,
			address: proposer.toSuiAddress(),
			addedBy: u1.address,
		});
		expect(
			await hasAccountAccess([proposerKey], account),
		).toBe(true);
		expect(
			await hasAccountAccess([proposerKey], account, {
				network: NETWORK,
			}),
		).toBe(true);
		expect(
			await canSignFor(proposerKey, account, NETWORK),
		).toBe(false);
	});

	test('4. the original is removed outside Sagat: its keys lose access once the state is older than the max age', async () => {
		await run(account, M2, [u2, u4], (tx) =>
			buildRemove(tx, { account, alias: account }),
		);

		// The state is fresh, so the mirror is trusted until it ages out.
		expect(
			await canSignFor(u1.publicKey, account, NETWORK),
		).toBe(true);

		await backdate(account);
		expect(
			await canSignFor(u1.publicKey, account, NETWORK),
		).toBe(false);
		expect(
			await hasAccountAccess([u1.publicKey], account),
		).toBe(false);
		expect(
			(await getMirroredAliases(account, NETWORK)).aliases,
		).toEqual(sorted([m2, K, X]));

		// The access check consumed the change; an explicit refresh has
		// nothing left to report.
		expect(
			await refreshAliases(account, NETWORK),
		).toMatchObject({
			aliases: [m2, K, X],
			added: [],
			removed: [],
		});

		const resolved = await resolveValidSignerSets(
			account,
			NETWORK,
		);
		expect(
			resolved.aliases.some((a) => a.address === account),
		).toBe(false);
		expect(
			resolved.signerSets.map((s) => s.address),
		).toEqual([m2]);
		// M2 is labelled 'Board' in its own account, not in this one.
		expect(resolved.signerSets[0].label).toBeNull();

		expect(
			sorted(await leafPublicKeys(account, NETWORK)),
		).toEqual(
			sorted([
				u2.publicKey,
				u3.publicKey,
				u4.publicKey,
				u5.publicKey,
			]),
		);
		expect(await isRotated(account)).toBe(true);

		// A signature from the removed key no longer counts.
		const progress = proposalProgress(
			{
				accountAddress: account,
				signatures: [
					{ publicKey: u1.publicKey, signature: 'x' },
					{ publicKey: u2.publicKey, signature: 'y' },
				],
			},
			resolved.signerSets,
		);
		expect(progress).toHaveLength(1);
		expect(progress[0].currentWeight).toBe(1);
		expect(progress[0].hasReachedThreshold).toBe(false);
	});

	test('5. a "not found" read never wipes a mirror that saw the object', async () => {
		// M2 is also an account and never called `enable`. Simulate a mirror
		// that saw its alias object (test only: production writes go through
		// refreshAliases), then a node that reports it missing.
		await db
			.update(SchemaAccountAliasState)
			.set({
				exists: true,
				observedVersion: 1,
				observedAt: new Date(),
			})
			.where(stateOf(m2));
		await db.insert(SchemaAccountAliases).values(
			[m2, X].map((aliasAddress) => ({
				accountAddress: m2,
				network: NETWORK,
				aliasAddress,
			})),
		);
		const before = await getMirroredAliases(m2, NETWORK);
		expect(await isRotated(m2)).toBe(true);

		expect(await refreshAliases(m2, NETWORK)).toEqual({
			exists: true,
			version: '1',
			aliases: sorted([m2, X]),
			added: [],
			removed: [],
		});
		expect(await getMirroredAliases(m2, NETWORK)).toEqual(
			before,
		);

		// Without a state row, "not found" is recorded as no alias object.
		await db
			.delete(SchemaAccountAliases)
			.where(eq(SchemaAccountAliases.accountAddress, m2));
		await db
			.delete(SchemaAccountAliasState)
			.where(stateOf(m2));
		expect(await refreshAliases(m2, NETWORK)).toEqual({
			exists: false,
			version: null,
			aliases: [m2],
			added: [],
			removed: [],
		});
		expect(
			await getMirroredAliases(m2, NETWORK),
		).toMatchObject({
			aliases: [m2],
			known: true,
			exists: false,
		});
		expect(await isRotated(m2)).toBe(false);

		// An address that is not an account is refused before any RPC, and
		// has no access.
		const stranger = new Ed25519Keypair().toSuiAddress();
		await expect(
			refreshAliases(stranger, NETWORK, {
				client: failingClient,
			}),
		).rejects.toBeInstanceOf(NotFoundError);
		expect(
			await canSignFor(u1.publicKey, stranger, NETWORK),
		).toBe(false);
		expect(
			await hasAccountAccess([u1.publicKey], stranger),
		).toBe(false);
		expect(await isRotated(stranger)).toBe(false);
	});

	test('6. RPC errors surface, leave the mirror untouched, and refuse access only when a refresh is needed', async () => {
		const before = await getMirroredAliases(
			account,
			NETWORK,
		);

		await expect(
			refreshAliases(account, NETWORK, {
				client: failingClient,
			}),
		).rejects.toThrow('rpc unavailable');

		const perObjectError = {
			core: {
				getObjects: async () => ({
					objects: [new Error('internal error')],
				}),
			},
		} as unknown as ClientWithCoreApi;
		await expect(
			refreshAliases(account, NETWORK, {
				client: perObjectError,
			}),
		).rejects.toThrow('internal error');

		expect(
			await getMirroredAliases(account, NETWORK),
		).toEqual(before);

		const spy = spyOn(
			clientUtils,
			'getSuiClient',
		).mockReturnValue(
			failingClient as ReturnType<
				typeof clientUtils.getSuiClient
			>,
		);
		try {
			// Fresh state: decided from the mirror, no RPC.
			expect(
				await canSignFor(u2.publicKey, account, NETWORK),
			).toBe(true);

			// Stale state and the refresh fails: refused.
			await backdate(account);
			await expect(
				canSignFor(u2.publicKey, account, NETWORK),
			).rejects.toBeInstanceOf(AliasStateUnavailableError);
			await expect(
				hasAccountAccess([u2.publicKey], account),
			).rejects.toBeInstanceOf(AliasStateUnavailableError);
			await expect(
				isRotated(account),
			).rejects.toBeInstanceOf(AliasStateUnavailableError);

			// A caller that already refreshed can skip it.
			expect(
				await canSignFor(u2.publicKey, account, NETWORK, {
					refresh: false,
				}),
			).toBe(true);
		} finally {
			spy.mockRestore();
		}

		// With the node back, the stale state is refreshed on the next check.
		expect(
			await canSignFor(u2.publicKey, account, NETWORK),
		).toBe(true);
	});
});
