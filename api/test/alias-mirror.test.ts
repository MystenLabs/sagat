// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The alias mirror against a local network. The steps share state and run in order.

import { deriveAliasesObjectId } from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import {
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from 'bun:test';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '../src/db';
import {
	ProposalStatus,
	SchemaAccountAliases,
	SchemaAccountAliasState,
	SchemaAccountEvents,
	SchemaProposals,
} from '../src/db/schema';
import { lockAccount } from '../src/db/transaction';
import {
	AliasStateUnavailableError,
	isLockTimeout,
} from '../src/errors';
import { createAliasSetLoaders } from '../src/loaders/alias-set.loader';
import {
	ALIAS_STATE_MAX_AGE_MS,
	refreshAliases,
	refreshStaleAliases,
	requireFreshAliases,
} from '../src/services/aliases.service';
import {
	buildAdd,
	buildEnable,
	buildRemove,
	fetchAliasSet,
} from '../src/utils/aliases';
import { ApiTestFramework } from './framework/api-test-framework';
import {
	readObjects,
	serving,
	type AliasObjects,
} from './setup/alias-reader';
import {
	build,
	execute,
	expectSuccess,
	keySigner,
	multisigSigner,
	run,
	type Signer,
} from './setup/localnet-transactions';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import {
	fundAddress,
	getLocalClient,
	LOCALNET_WAIT,
} from './setup/sui-network';
import { untilBackendsWaitOnALock } from './setup/test-db';

setupSharedTestEnvironment();
setDefaultTimeout(60_000);

const client = getLocalClient();
const NETWORK = 'localnet';

const unreachable = new Error('node unreachable');

const send = async (
	sender: string,
	signer: Signer,
	fill: (tx: Transaction) => void,
) => expectSuccess(await run(sender, signer, fill)).digest;

const stateWhere = (account: string) =>
	and(
		eq(SchemaAccountAliasState.accountAddress, account),
		eq(SchemaAccountAliasState.network, NETWORK),
	);

const mirrorOf = async (account: string) => {
	const [state] = await db
		.select()
		.from(SchemaAccountAliasState)
		.where(stateWhere(account));
	const aliases = await db
		.select({ address: SchemaAccountAliases.aliasAddress })
		.from(SchemaAccountAliases)
		.where(
			and(
				eq(SchemaAccountAliases.accountAddress, account),
				eq(SchemaAccountAliases.network, NETWORK),
			),
		)
		.orderBy(asc(SchemaAccountAliases.aliasAddress));
	const events = await db
		.select()
		.from(SchemaAccountEvents)
		.where(eq(SchemaAccountEvents.accountAddress, account))
		.orderBy(asc(SchemaAccountEvents.id));
	return {
		state,
		aliases: aliases.map((row) => row.address),
		events,
	};
};

// A proposal row of `account` with the bytes, as Sagat would hold it.
const proposalOf = async (
	account: string,
	bytes: Uint8Array,
	status: ProposalStatus,
) => {
	const transactionBytes = toBase64(bytes);
	const [proposal] = await db
		.insert(SchemaProposals)
		.values({
			accountAddress: account,
			digest: await Transaction.from(
				transactionBytes,
			).getDigest(),
			transactionBytes,
			proposerAddress: account,
			network: NETWORK,
			status,
		})
		.returning();
	return proposal;
};

const outcomesOf = async (ids: number[]) =>
	Promise.all(
		ids.map(async (id) => {
			const [row] = await db
				.select({
					status: SchemaProposals.status,
					executedVia: SchemaProposals.executedVia,
				})
				.from(SchemaProposals)
				.where(eq(SchemaProposals.id, id));
			return row;
		}),
	);

const backdate = (account: string, ageMs: number) =>
	db
		.update(SchemaAccountAliasState)
		.set({ observedAt: new Date(Date.now() - ageMs) })
		.where(stateWhere(account));

describe('Alias mirror', () => {
	let A: string;
	let B: string;
	let signerA: Signer;
	const K = new Ed25519Keypair();
	const signerK = keySigner('K', K);
	// Responses captured earlier, served again to play a lagging node.
	let notFound: AliasObjects;
	let enabled: AliasObjects;
	// One loader for steps 1 to 4: a cached read would fail steps 3 and 4.
	const chainLoaders = createAliasSetLoaders();

	beforeAll(async () => {
		const framework = new ApiTestFramework(
			await createTestApp(),
		);
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		A = multisig.address;
		signerA = multisigSigner(
			'A',
			users.map((u) => u.keypair),
			2,
		);
		expect(signerA.address).toBe(A);

		B = (await session.createMultisig(users, 1)).address;
	});

	test('1. the first refresh of an account that never enabled aliases', async () => {
		notFound = await readObjects([
			deriveAliasesObjectId(A),
		]);

		const [result] = await refreshAliases(
			[A],
			NETWORK,
			chainLoaders,
		);
		expect(result).toMatchObject({
			accountAddress: A,
			outcome: 'updated',
			exists: false,
			version: null,
			added: [],
			removed: [],
		});

		const mirror = await mirrorOf(A);
		expect(mirror.state).toMatchObject({
			exists: false,
			observedVersion: null,
		});
		expect(mirror.aliases).toEqual([]);
		expect(mirror.events).toEqual([]);
	});

	test('2. an unchanged refresh takes no lock', async () => {
		const before = (await mirrorOf(A)).state.observedAt;
		await Bun.sleep(5);

		const [result] = await db.transaction(async (tx) => {
			await lockAccount(tx, A);
			return refreshAliases([A], NETWORK, chainLoaders);
		});

		expect(result.outcome).toBe('unchanged');
		expect(
			(await mirrorOf(A)).state.observedAt.getTime(),
		).toBeGreaterThan(before.getTime());
	});

	test('3. after enable: the object is mirrored as {account}, with no events', async () => {
		await send(A, signerA, buildEnable);
		enabled = await readObjects([deriveAliasesObjectId(A)]);
		const onChain = await fetchAliasSet(client, A);

		const [result] = await refreshAliases(
			[A],
			NETWORK,
			chainLoaders,
		);
		expect(result).toMatchObject({
			outcome: 'updated',
			exists: true,
			version: onChain.version!,
			added: [],
			removed: [],
		});

		const mirror = await mirrorOf(A);
		expect(mirror.state).toMatchObject({
			exists: true,
			observedVersion: Number(onChain.version),
		});
		expect(mirror.aliases).toEqual([A]);
		expect(mirror.events).toEqual([]);
	});

	test('4. a change records its events once', async () => {
		await send(A, signerA, (tx) =>
			buildAdd(tx, {
				account: A,
				alias: K.toSuiAddress(),
			}),
		);
		const lastDigest = await send(A, signerA, (tx) =>
			buildRemove(tx, { account: A, alias: A }),
		);
		const onChain = await fetchAliasSet(client, A);

		const [result] = await refreshAliases(
			[A],
			NETWORK,
			chainLoaders,
		);
		expect(result).toEqual({
			accountAddress: A,
			outcome: 'updated',
			exists: true,
			version: onChain.version!,
			digest: lastDigest,
			added: [K.toSuiAddress()],
			removed: [A],
		});

		const proof = {
			kind: 'chain',
			digest: lastDigest,
			objectVersion: onChain.version,
		};
		const mirror = await mirrorOf(A);
		expect(mirror.aliases).toEqual([K.toSuiAddress()]);
		expect(
			mirror.events.map(
				({ action, actor, subject, network, proof }) => ({
					action,
					actor,
					subject,
					network,
					proof,
				}),
			),
		).toEqual([
			{
				action: 'alias.added',
				actor: 'system',
				subject: K.toSuiAddress(),
				network: NETWORK,
				proof,
			},
			{
				action: 'alias.removed',
				actor: 'system',
				subject: A,
				network: NETWORK,
				proof,
			},
		]);

		const [again] = await refreshAliases(
			[A],
			NETWORK,
			chainLoaders,
		);
		expect(again.outcome).toBe('unchanged');
		expect((await mirrorOf(A)).events).toHaveLength(2);
	});

	test('5. never backwards: an older version or "not found" keeps the mirror', async () => {
		for (const stale of [enabled, notFound]) {
			const before = await mirrorOf(A);
			const [result] = await refreshAliases(
				[A],
				NETWORK,
				serving(async () => stale).loaders,
			);
			expect(result).toMatchObject({
				outcome: 'kept',
				exists: true,
				version: String(before.state.observedVersion),
			});
			expect(await mirrorOf(A)).toEqual(before);
		}
	});

	test('6. a read error leaves the mirror alone', async () => {
		const before = await mirrorOf(A);
		const [result] = await refreshAliases(
			[A],
			NETWORK,
			serving(async () => {
				throw unreachable;
			}).loaders,
		);
		expect(result).toEqual({
			accountAddress: A,
			outcome: 'failed',
			error: unreachable,
		});
		expect(await mirrorOf(A)).toEqual(before);
	});

	test('7. one failed object in a batch fails only its own account', async () => {
		const before = await mirrorOf(A);
		const objectError = new Error('object unreadable');
		const { loaders, calls } = serving(
			async (objectIds) => {
				const response = await readObjects(objectIds);
				return {
					objects: response.objects.map((entry, i) =>
						objectIds[i] === deriveAliasesObjectId(A)
							? objectError
							: entry,
					),
				};
			},
		);

		const [a, b] = await refreshAliases(
			[A, B],
			NETWORK,
			loaders,
		);
		expect(calls()).toBe(1);
		expect(a).toEqual({
			accountAddress: A,
			outcome: 'failed',
			error: objectError,
		});
		expect(b).toMatchObject({
			accountAddress: B,
			outcome: 'updated',
			exists: false,
		});
		expect(await mirrorOf(A)).toEqual(before);
	});

	test('8. two refreshes of one account at once record the events once', async () => {
		const X = new Ed25519Keypair().toSuiAddress();
		await send(A, signerK, (tx) =>
			buildAdd(tx, { account: A, alias: X }),
		);

		const { refreshes } = await db.transaction(
			async (tx) => {
				await lockAccount(tx, A);
				const refreshes = Promise.all([
					refreshAliases(
						[A],
						NETWORK,
						createAliasSetLoaders(),
					),
					refreshAliases(
						[A],
						NETWORK,
						createAliasSetLoaders(),
					),
				]);
				await untilBackendsWaitOnALock(db, 2);
				return { refreshes };
			},
		);

		const outcomes = (await refreshes).map(
			([result]) => result.outcome,
		);
		expect(outcomes.sort()).toEqual([
			'unchanged',
			'updated',
		]);
		const added = (await mirrorOf(A)).events.filter(
			(event) => event.subject === X,
		);
		expect(added.map((event) => event.action)).toEqual([
			'alias.added',
		]);
	});

	test('9. the 60 second rule', async () => {
		const reads = serving(readObjects);
		await backdate(A, ALIAS_STATE_MAX_AGE_MS - 1_000);
		expect(
			await refreshStaleAliases(
				[A],
				NETWORK,
				reads.loaders,
			),
		).toMatchObject([
			{ accountAddress: A, outcome: 'fresh', exists: true },
		]);
		expect(reads.calls()).toBe(0);

		await backdate(A, -5_000);
		expect(
			await refreshStaleAliases(
				[A],
				NETWORK,
				reads.loaders,
			),
		).toMatchObject([
			{ accountAddress: A, outcome: 'unchanged' },
		]);
		expect(reads.calls()).toBe(1);

		await backdate(A, ALIAS_STATE_MAX_AGE_MS + 1_000);
		await db
			.delete(SchemaAccountAliasState)
			.where(stateWhere(B));
		const results = await refreshStaleAliases(
			[A, B],
			NETWORK,
			reads.loaders,
		);
		expect(results.map((r) => r.outcome)).toEqual([
			'unchanged',
			'updated',
		]);
		expect(reads.calls()).toBe(2);

		const failing = serving(async () => {
			throw unreachable;
		});
		await expect(
			requireFreshAliases(A, NETWORK, failing.loaders),
		).resolves.toMatchObject({ outcome: 'fresh' });
		expect(failing.calls()).toBe(0);

		await backdate(A, ALIAS_STATE_MAX_AGE_MS + 1_000);
		const error = await requireFreshAliases(
			A,
			NETWORK,
			failing.loaders,
		).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(
			AliasStateUnavailableError,
		);
		expect((error as Error).message).toContain(A);
		expect((error as Error).message).toContain(NETWORK);
		expect((error as Error).cause).toBe(unreachable);

		// A rejection from the refresh itself, not a failed outcome.
		await backdate(A, ALIAS_STATE_MAX_AGE_MS + 1_000);
		const broken = new Error('loaders broken');
		const rejected = await requireFreshAliases(
			A,
			NETWORK,
			() => {
				throw broken;
			},
		).catch((e: unknown) => e);
		expect(rejected).toBeInstanceOf(
			AliasStateUnavailableError,
		);
		expect((rejected as Error).message).toContain(A);
		expect((rejected as Error).message).toContain(NETWORK);
		expect((rejected as Error).cause).toBe(broken);
	});

	test('10. 51 addresses through one loader cost two reads', async () => {
		const { loaders, calls } = serving(readObjects);
		const addresses = Array.from({ length: 51 }, () =>
			new Ed25519Keypair().toSuiAddress(),
		);
		const sets = await loaders(NETWORK).loadMany(addresses);
		expect(calls()).toBe(2);
		expect(
			sets.every((set) => !(set instanceof Error)),
		).toBe(true);
	});

	test('11. an object returned for the wrong account fails that account', async () => {
		const before = await mirrorOf(B);
		const { loaders } = serving(async (objectIds) => {
			const response = await readObjects(objectIds);
			return {
				objects: response.objects.map((entry, i) =>
					objectIds[i] === deriveAliasesObjectId(B)
						? enabled.objects[0]
						: entry,
				),
			};
		});

		const [a, b] = await refreshAliases(
			[A, B],
			NETWORK,
			loaders,
		);
		expect(a.outcome).toBe('unchanged');
		expect(b).toMatchObject({
			accountAddress: B,
			outcome: 'failed',
		});
		expect(await mirrorOf(B)).toEqual(before);
	});

	test('12. a write that fails stays with its account', async () => {
		await db
			.delete(SchemaAccountAliasState)
			.where(stateWhere(B));

		// Wrapped, as returning it bare would make the transaction wait for it.
		const { refresh, required } = await db.transaction(
			async (tx) => {
				await lockAccount(tx, B);
				const refresh = refreshAliases(
					[A, B],
					NETWORK,
					createAliasSetLoaders(),
				);
				const required = requireFreshAliases(
					B,
					NETWORK,
					createAliasSetLoaders(),
				).catch((e: unknown) => e);
				await untilBackendsWaitOnALock(db, 2);
				// Fails here instead of hanging if the write never gives up.
				await Promise.race([
					Promise.all([refresh, required]),
					Bun.sleep(3000),
				]);
				return { refresh, required };
			},
		);

		const [a, b] = await refresh;
		expect(a).toMatchObject({
			accountAddress: A,
			outcome: 'unchanged',
		});
		expect(b).toMatchObject({
			accountAddress: B,
			outcome: 'failed',
		});
		expect((await mirrorOf(B)).state).toBeUndefined();
		const error = await required;
		expect(error).not.toBeInstanceOf(
			AliasStateUnavailableError,
		);
		expect(isLockTimeout(error)).toBe(true);
	});

	test('13. refreshes of one account at once share one read', async () => {
		const { loaders, calls, lastIds } =
			serving(readObjects);
		const results = await Promise.all([
			refreshAliases([A], NETWORK, loaders),
			refreshAliases([A], NETWORK, loaders),
		]);
		expect(calls()).toBe(1);
		expect(lastIds()).toEqual([deriveAliasesObjectId(A)]);
		expect(
			results.map(([result]) => result.outcome),
		).toEqual(['unchanged', 'unchanged']);
	});

	test('13b. many loads of one account at once cost one read of one object', async () => {
		const { loaders, calls, lastIds } =
			serving(readObjects);
		const sets = await Promise.all(
			Array.from({ length: 120 }, () =>
				loaders(NETWORK).load(A),
			),
		);
		expect(calls()).toBe(1);
		expect(lastIds()).toEqual([deriveAliasesObjectId(A)]);
		expect(sets.every((set) => set.exists)).toBe(true);
	});

	test('14. a malformed address fails only itself', async () => {
		const { loaders, calls, lastIds } =
			serving(readObjects);
		const [a, bad] = await loaders(NETWORK).loadMany([
			A,
			'0xzz',
		]);
		expect(a).toMatchObject({ exists: true });
		expect(bad).toBeInstanceOf(Error);
		expect(calls()).toBe(1);
		expect(lastIds()).toEqual([deriveAliasesObjectId(A)]);
	});
	// Builds and executes an alias call from `A` signed by `K`, outside any proposal.
	const executeAsK = async (
		fill: (tx: Transaction) => void,
	) => {
		const bytes = await build(A, fill);
		return {
			bytes,
			result: await execute(
				bytes,
				await signerK.sign(bytes),
			),
		};
	};

	// Through a new loader, so no earlier read is reused.
	const refreshA = () =>
		refreshAliases([A], NETWORK, createAliasSetLoaders());
	// What a settled proposal that `K` executed records.
	const settled = {
		status: ProposalStatus.SUCCESS,
		executedVia: K.toSuiAddress(),
	};

	// Added in step 15, removed in step 16.
	const [Y, Z] = Array.from({ length: 2 }, () =>
		new Ed25519Keypair().toSuiAddress(),
	);

	test('15. a pending and a cancelled alias proposal that executed are settled by the refresh that sees the change; one not on chain keeps its status', async () => {
		const W = new Ed25519Keypair().toSuiAddress();
		const pendingCall = await executeAsK((tx) =>
			buildAdd(tx, { account: A, alias: Y }),
		);
		const cancelledCall = await executeAsK((tx) =>
			buildAdd(tx, { account: A, alias: Z }),
		);
		const lastDigest = expectSuccess(
			cancelledCall.result,
		).digest;
		const neverRun = await build(A, (tx) =>
			buildAdd(tx, { account: A, alias: W }),
		);
		const proposals = [
			await proposalOf(
				A,
				pendingCall.bytes,
				ProposalStatus.PENDING,
			),
			await proposalOf(
				A,
				cancelledCall.bytes,
				ProposalStatus.CANCELLED,
			),
			await proposalOf(
				A,
				neverRun,
				ProposalStatus.CANCELLED,
			),
		];

		const [result] = await refreshA();

		expect(result).toMatchObject({
			outcome: 'updated',
			digest: lastDigest,
			added: [Y, Z].sort(),
			removed: [],
		});
		expect(
			await outcomesOf(proposals.map((p) => p.id)),
		).toEqual([
			settled,
			settled,
			{
				status: ProposalStatus.CANCELLED,
				executedVia: null,
			},
		]);
	});

	test('16. settling still happens when a later alias change sits on top', async () => {
		const pendingCall = await executeAsK((tx) =>
			buildRemove(tx, { account: A, alias: Y }),
		);
		const cancelledCall = await executeAsK((tx) =>
			buildRemove(tx, { account: A, alias: Z }),
		);
		const proposals = [
			await proposalOf(
				A,
				pendingCall.bytes,
				ProposalStatus.PENDING,
			),
			await proposalOf(
				A,
				cancelledCall.bytes,
				ProposalStatus.CANCELLED,
			),
		];
		const V = new Ed25519Keypair().toSuiAddress();
		const lastDigest = await send(A, signerK, (tx) =>
			buildAdd(tx, { account: A, alias: V }),
		);

		const [result] = await refreshA();

		expect(result).toMatchObject({
			outcome: 'updated',
			digest: lastDigest,
			added: [V],
			removed: [Y, Z].sort(),
		});
		expect(
			await outcomesOf(proposals.map((p) => p.id)),
		).toEqual([settled, settled]);
	});

	test('17. an alias call that failed on chain is recorded as failed and changes nothing', async () => {
		// Two adds of one alias, both built while it is absent: the second aborts.
		// It is sponsored, so it does not spend the gas coin of the first.
		const sponsor = new Ed25519Keypair();
		await fundAddress(sponsor.toSuiAddress());
		const Q = new Ed25519Keypair().toSuiAddress();
		const failing = await build(A, (tx) => {
			tx.setGasOwner(sponsor.toSuiAddress());
			buildAdd(tx, { account: A, alias: Q });
		});
		await send(A, signerK, (tx) =>
			buildAdd(tx, { account: A, alias: Q }),
		);
		await refreshA();
		const before = await mirrorOf(A);

		const result = await client.executeTransaction({
			transaction: failing,
			signatures: [
				await signerK.sign(failing),
				(await sponsor.signTransaction(failing)).signature,
			],
			include: { effects: true },
		});
		await client.waitForTransaction({
			result,
			...LOCALNET_WAIT,
		});
		expect(result.$kind).toBe('FailedTransaction');
		const proposal = await proposalOf(
			A,
			failing,
			ProposalStatus.PENDING,
		);

		const [refreshed] = await refreshA();

		// The abort still moves the object's version.
		expect(refreshed).toMatchObject({
			outcome: 'updated',
			digest: proposal.digest,
			added: [],
			removed: [],
		});
		const after = await mirrorOf(A);
		expect(after.aliases).toEqual(before.aliases);
		expect(after.events).toEqual(before.events);
		expect(await outcomesOf([proposal.id])).toEqual([
			{
				status: ProposalStatus.FAILURE,
				executedVia: K.toSuiAddress(),
			},
		]);
	});

	test('18. a replace_all is recorded as the removals and additions it made', async () => {
		const before = (await mirrorOf(A)).aliases;
		const X = new Ed25519Keypair().toSuiAddress();
		const lastDigest = await send(A, signerK, (tx) =>
			tx.moveCall({
				target: '0x2::address_alias::replace_all',
				arguments: [
					tx.object(deriveAliasesObjectId(A)),
					tx.pure.vector('address', [K.toSuiAddress(), X]),
				],
			}),
		);

		const [result] = await refreshA();

		expect(result).toMatchObject({
			outcome: 'updated',
			digest: lastDigest,
			added: [X],
			removed: before
				.filter((a) => a !== K.toSuiAddress())
				.sort(),
		});
		expect((await mirrorOf(A)).aliases).toEqual(
			[K.toSuiAddress(), X].sort(),
		);
	});
});
