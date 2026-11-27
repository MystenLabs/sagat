// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Proposing a signer change on the local network, through the `/v1` routes,
// with the cast of `setup/signer-changes`.

import {
	buildAdd,
	buildEnable,
	buildRemove,
	compositionNote,
	type Composition,
} from '@mysten/sagat';
import {
	Inputs,
	Transaction,
} from '@mysten/sui/transactions';
import { toBase58, toBase64 } from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from 'bun:test';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '../src/db';
import {
	ProposalStatus,
	SchemaAccountKeys,
	SchemaAccountSignerSets,
	SchemaProposals,
	SchemaSignerSetMembers,
	SchemaSignerSets,
} from '../src/db/schema';
import { ApiAuthError } from '../src/errors';
import { signerChangesOf } from '../src/services/accounts.service';
import {
	assertNoPendingAliasProposal,
	currentEpochOf,
} from '../src/services/signer-changes.service';
import {
	ApiTestFramework,
	buildTransfer,
	newUser,
	refusal,
	signedBy,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import { setAliases } from './setup/acting-sets';
import { build } from './setup/localnet-transactions';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import {
	addressOf,
	buildCastChange,
	compositionOf,
	createCast,
	enableSignerChanges,
	gasCoins,
	proposeCastChange,
	proposeChange,
	type Cast,
} from './setup/signer-changes';
import { insertProposal } from './setup/v1-proposals';

setupSharedTestEnvironment();
setDefaultTimeout(60_000);

const STALE =
	'The signers of this account changed since the signer change was built. Build it again from the current signers.';
const NOT_STAYING = new ApiAuthError('NotASignerWhoStays')
	.message;
const NOT_ACCEPTED = new ApiAuthError('AccountNotAccepted')
	.message;
const pendingAliasProposal = (digest: string) =>
	`Another proposal that changes who controls this account on localnet is pending (${digest}). Execute or cancel it first.`;

// A hand-written change that only removes `alias`, with the SDK's note for `before`.
const removal = async (
	cast: Cast,
	alias: string,
	before: string[],
	known: Composition[] = [cast.S1],
) => {
	const { expiration, gasData, inputs } = Transaction.from(
		await buildCastChange(cast, cast.S2),
	).getData();
	return toBase64(
		await build(cast.A, (tx) => {
			// Every input resolved, so nothing dry-runs against the chain's alias set.
			tx.object(
				Inputs.SharedObjectRef(
					inputs.find((i) => i.Object?.SharedObject)!
						.Object!.SharedObject!,
				),
			);
			buildRemove(tx, { account: cast.A, alias });
			for (const text of compositionNote({
				account: cast.A,
				before,
				after: before.filter((a) => a !== alias),
				known,
			}))
				tx.pure.string(text);
			tx.setExpiration(expiration!);
			tx.setGasPayment(gasData.payment!);
			tx.setGasPrice(BigInt(gasData.price!));
			tx.setGasBudget(BigInt(gasData.budget!));
		}),
	);
};

describe('POST /v1/proposals with a signer change', () => {
	let framework: ApiTestFramework;
	let session: TestSession;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
		session = framework.createSession();
	});

	const pendingProposals = async (account: string) =>
		db
			.select({ digest: SchemaProposals.digest })
			.from(SchemaProposals)
			.where(
				and(
					eq(SchemaProposals.accountAddress, account),
					eq(
						SchemaProposals.status,
						ProposalStatus.PENDING,
					),
				),
			);

	test('a signer who stays proposes S1 to S2: the new set, its members in order and its link are written, and only the new key is labelled, for a signer’s session only, with no invitation yet', async () => {
		const cast = await createCast(session);
		const { k1, k2, k4, A, S2 } = cast;

		const created = await proposeCastChange(
			session,
			cast,
			S2,
			{
				labels: [null, 'Ben', 'Dee'],
			},
		);

		expect(created.status).toBe('PENDING');
		expect(created.signerChange?.labels).toEqual([
			{ publicKey: k4.publicKey, label: 'Dee' },
		]);
		const labelsAs = async (reader: TestSession) =>
			(await reader.v1.getProposalByDigest(created.digest))
				.signerChange?.labels;
		expect(
			await labelsAs(framework.createSession()),
		).toEqual([]);
		expect(
			await labelsAs(
				await framework.connectedSession(newUser()),
			),
		).toEqual([]);
		const S2Address = addressOf(S2);
		expect(
			await db
				.select()
				.from(SchemaSignerSets)
				.where(eq(SchemaSignerSets.address, S2Address)),
		).toEqual([
			{
				address: S2Address,
				threshold: 2,
				isVerified: false,
				name: null,
			},
		]);
		expect(
			await db
				.select({
					publicKey: SchemaSignerSetMembers.publicKey,
					weight: SchemaSignerSetMembers.weight,
					isAccepted: SchemaSignerSetMembers.isAccepted,
					isRejected: SchemaSignerSetMembers.isRejected,
				})
				.from(SchemaSignerSetMembers)
				.where(
					eq(
						SchemaSignerSetMembers.signerSetAddress,
						S2Address,
					),
				)
				.orderBy(asc(SchemaSignerSetMembers.order)),
		).toEqual(
			[k1, k2, k4].map((key) => ({
				publicKey: key.publicKey,
				weight: 1,
				isAccepted: false,
				isRejected: false,
			})),
		);
		expect(
			await db
				.select({
					status: SchemaAccountSignerSets.status,
					draftedBy: SchemaAccountSignerSets.draftedBy,
				})
				.from(SchemaAccountSignerSets)
				.where(
					and(
						eq(SchemaAccountSignerSets.accountAddress, A),
						eq(
							SchemaAccountSignerSets.signerSetAddress,
							S2Address,
						),
					),
				),
		).toEqual([
			{ status: 'inviting', draftedBy: k1.address },
		]);
		expect(
			await db
				.select({
					publicKey: SchemaAccountKeys.publicKey,
					label: SchemaAccountKeys.label,
					updatedBy: SchemaAccountKeys.updatedBy,
				})
				.from(SchemaAccountKeys)
				.where(eq(SchemaAccountKeys.accountAddress, A)),
		).toEqual([
			{
				publicKey: k4.publicKey,
				label: 'Dee',
				updatedBy: k1.address,
			},
		]);

		// New keys are invited once the set acts.
		const newKey = framework.createSession();
		await newKey.connectUser(k4);
		expect(
			(await newKey.v1.getInvitations('localnet'))
				.invitations,
		).toEqual([]);
		expect(
			(await newKey.v1.getAccounts('localnet')).accounts,
		).toEqual([]);
	});

	test('a proposer who leaves or has not accepted is refused with a 403, and a change whose accepted signers who stay cannot meet the new threshold is created', async () => {
		const cast = await createCast(session, {
			unaccepted: [3],
		});
		const { k1, k2, k3, k4, A, S3 } = cast;
		const propose = async (
			proposer: TestUser,
			newSet: Cast['S1'],
		) =>
			refusal(
				proposeChange(
					session,
					proposer,
					A,
					await buildCastChange(cast, newSet),
				),
			);

		expect(
			await propose(k1, compositionOf([k2, k3, k4], 2)),
		).toEqual({ status: 403, message: NOT_STAYING });
		expect(await propose(k3, S3)).toEqual({
			status: 403,
			message: NOT_ACCEPTED,
		});
		// `k3` stays but has not accepted, so `k1` and `k2` weigh 2 of 3.
		const short = await proposeChange(
			session,
			k1,
			A,
			await buildCastChange(cast, S3),
		);
		expect(short.status).toBe('PENDING');
		await session.cancelProposal(k1, short);

		// A key's own address left is no set to stay in.
		await setAliases(A, 'localnet', [k1.address]);
		expect(
			await refusal(
				proposeChange(
					session,
					k1,
					A,
					await removal(cast, A, [A, k1.address]),
				),
			),
		).toEqual({
			status: 400,
			message:
				'The change’s note states no signer set the API can identify acting for the account.',
		});
	});

	test('a change that only removes counts as remaining only the sets its note states that the API also identifies as acting, and is refused when there is none', async () => {
		const cast = await createCast(session);
		const { k1, A, S1 } = cast;
		const U = compositionOf([k1, newUser()], 1);
		await setAliases(A, 'localnet', [addressOf(U)]);

		expect(
			await refusal(
				proposeChange(
					session,
					k1,
					A,
					await removal(
						cast,
						A,
						[A, addressOf(U)],
						[S1, U],
					),
				),
			),
		).toEqual({
			status: 400,
			message:
				'The change’s note states no signer set the API can identify acting for the account.',
		});
	});

	test('a change built before the alias set changed on chain, and one that replaces an alias the API cannot identify, are refused', async () => {
		const cast = await createCast(session);
		const { k1, k2, A, S1, S2 } = cast;
		const [coin] = await gasCoins(A, 1);
		const stale = await buildCastChange(cast, S2, {
			gasCoin: coin,
		});
		const [x, y] = [newUser(), newUser()];
		const U = compositionOf([x, y], 1);
		// Verifying the add refreshes the mirror.
		const add = await session.createProposal(
			k1,
			A,
			'localnet',
			toBase64(
				await build(A, (tx) =>
					buildAdd(tx, { account: A, alias: addressOf(U) }),
				),
			),
		);
		await session.voteAndExecute([k2], add.digest);

		expect(
			await refusal(proposeChange(session, k1, A, stale)),
		).toEqual({ status: 400, message: STALE });
		expect(
			await refusal(
				proposeCastChange(
					session,
					cast,
					compositionOf([x, k1], 1),
					{ oldSet: addressOf(U), known: [S1, U] },
				),
			),
		).toEqual({
			status: 400,
			message: `The signer set this change replaces, ${addressOf(U)}, is not one the API can identify as acting for the account on localnet.`,
		});
		expect(
			await refusal(
				proposeChange(
					session,
					k1,
					A,
					await removal(cast, k1.address, [A, k1.address]),
				),
			),
		).toEqual({
			status: 400,
			message: `This is not a valid signer change: The note does not hold the composition of the removed set ${k1.address}.`,
		});
	});

	test('a change that names another chain, or none, or has no expiration epoch by the end of the one after next, is refused, and one that expires with it is not', async () => {
		const cast = await createCast(session);
		const { k1, A, S2 } = cast;
		const bytes = await buildCastChange(cast, S2);
		const withExpiration = async (
			expiration: Parameters<
				Transaction['setExpiration']
			>[0],
		) => {
			const tx = Transaction.from(bytes);
			tx.setExpiration(expiration);
			return toBase64(await tx.build());
		};
		const { ValidDuring } =
			Transaction.from(bytes).getData().expiration!;

		expect(
			await refusal(
				proposeChange(
					session,
					k1,
					A,
					await withExpiration({
						ValidDuring: {
							...ValidDuring!,
							chain: toBase58(new Uint8Array(32).fill(1)),
						},
					}),
				),
			),
		).toEqual({
			status: 400,
			message:
				'This signer change names another chain than localnet.',
		});
		expect(
			await refusal(
				proposeChange(
					session,
					k1,
					A,
					await withExpiration({ None: true }),
				),
			),
		).toEqual({
			status: 400,
			message:
				'A signer change must name its chain in the transaction’s expiration.',
		});
		const epoch = await currentEpochOf('localnet');
		for (const maxEpoch of [String(epoch + 3n), null])
			expect(
				await refusal(
					proposeChange(
						session,
						k1,
						A,
						await withExpiration({
							ValidDuring: { ...ValidDuring!, maxEpoch },
						}),
					),
				),
			).toEqual({
				status: 400,
				message:
					'A signer change must expire by the end of the next epoch. Build it again.',
			});
		expect(
			(
				await proposeChange(
					session,
					k1,
					A,
					await withExpiration({
						ValidDuring: {
							...ValidDuring!,
							maxEpoch: String(epoch + 2n),
						},
					}),
				)
			).status,
		).toBe('PENDING');
	});

	test('one proposal that calls the alias module at a time: a change waits for a pending enable, and a hand-written one for a pending change', async () => {
		const cast = await createCast(session, {
			enable: false,
		});
		const { k1, k2, A, S2, S3 } = cast;
		const coins = await gasCoins(A, 5);
		// Built while the alias object does not exist yet, so it dry-runs.
		const secondEnable = toBase64(
			await build(A, buildEnable, coins[0]),
		);
		await enableSignerChanges(
			session,
			A,
			[k1, k2],
			coins[1],
		);
		const toS2 = await buildCastChange(cast, S2, {
			gasCoin: coins[2],
		});
		const toS3 = await buildCastChange(cast, S3, {
			gasCoin: coins[3],
		});
		const proposer = newUser();
		await session.addProposer(k1, proposer.address, A);

		const enable = await session.createProposal(
			k1,
			A,
			'localnet',
			secondEnable,
		);
		expect(
			await refusal(proposeChange(session, k1, A, toS2)),
		).toEqual({
			status: 400,
			message: pendingAliasProposal(enable.digest),
		});

		await session.cancelProposal(k1, enable);
		const first = await proposeChange(session, k1, A, toS2);
		const handWritten = toBase64(
			await build(
				A,
				(tx) =>
					buildAdd(tx, {
						account: A,
						alias: newUser().address,
					}),
				coins[4],
			),
		);
		expect(
			await refusal(
				session.createProposal(
					k1,
					A,
					'localnet',
					handWritten,
				),
			),
		).toEqual({
			status: 400,
			message: pendingAliasProposal(first.digest),
		});
		expect(
			await refusal(
				session.createProposal(
					proposer,
					A,
					'localnet',
					handWritten,
				),
			),
		).toEqual({
			status: 400,
			message: pendingAliasProposal(first.digest),
		});

		await session.cancelProposal(k1, first);
		expect(
			await refusal(
				proposeChange(session, proposer, A, toS3),
			),
		).toEqual({ status: 403, message: NOT_STAYING });
		const next = await proposeChange(session, k1, A, toS3);
		expect(next.status).toBe('PENDING');
	});

	test('the newest pending change is the open one until it expires', async () => {
		const cast = await createCast(session);
		const { k1, A, S2, S3 } = cast;
		// Written directly: the older one ends after epoch 101, the newer after epoch 1.
		const written = async (
			newSet: Composition,
			epoch: bigint,
		) =>
			(
				await insertProposal(A, 'localnet', k1.address, {
					transactionBytes: await buildCastChange(
						cast,
						newSet,
						{ epoch },
					),
				})
			).digest;
		const older = await written(S2, 100n);
		const newer = await written(S3, 0n);
		const openAt = async (epoch: bigint) =>
			(
				await signerChangesOf(
					A,
					'localnet',
					async () => epoch,
				)
			).openSignerChange;

		expect(await openAt(1n)).toEqual({ digest: newer });
		expect(await openAt(2n)).toEqual({ digest: older });
	});

	test('a pending change counts for one at a time through its last epoch, and not after it', async () => {
		const cast = await createCast(session);
		const { A, S2 } = cast;
		const created = await proposeCastChange(
			session,
			cast,
			S2,
		);
		const last = BigInt(
			Transaction.from(created.transactionBytes).getData()
				.expiration!.ValidDuring!.maxEpoch!,
		);
		const checkAt = (epoch: bigint) =>
			db.transaction((tx) =>
				assertNoPendingAliasProposal(
					tx,
					A,
					'localnet',
					epoch,
				),
			);

		await checkAt(last + 1n);
		await expect(checkAt(last)).rejects.toThrow(
			pendingAliasProposal(created.digest),
		);
	});

	test('of two different changes created at once, exactly one is created', async () => {
		const cast = await createCast(session);
		const { k1, A, S2, S3 } = cast;
		const coins = await gasCoins(A, 2);
		const changes = await Promise.all(
			[S2, S3].map((newSet, i) =>
				buildCastChange(cast, newSet, {
					gasCoin: coins[i],
				}),
			),
		);

		const results = await Promise.allSettled(
			changes.map((bytes) =>
				proposeChange(session, k1, A, bytes),
			),
		);

		expect(
			results.filter((r) => r.status === 'fulfilled'),
		).toHaveLength(1);
		expect(await pendingProposals(A)).toHaveLength(1);
	});

	test('a composition that is already an account is linked as it is', async () => {
		const cast = await createCast(session);
		const { k1, k2, k4, A, S2 } = cast;
		const S2Address = (
			await session.createMultisig([k1, k2, k4], 2)
		).address;
		expect(S2Address).toBe(addressOf(S2));
		const membersOfS2 = () =>
			db
				.select()
				.from(SchemaSignerSetMembers)
				.where(
					eq(
						SchemaSignerSetMembers.signerSetAddress,
						S2Address,
					),
				)
				.orderBy(asc(SchemaSignerSetMembers.order));
		const before = await membersOfS2();

		await proposeCastChange(session, cast, S2);

		expect(await membersOfS2()).toEqual(before);
		expect(
			await db
				.select({
					accountAddress:
						SchemaAccountSignerSets.accountAddress,
					draftedBy: SchemaAccountSignerSets.draftedBy,
				})
				.from(SchemaAccountSignerSets)
				.where(
					eq(
						SchemaAccountSignerSets.signerSetAddress,
						S2Address,
					),
				)
				.orderBy(asc(SchemaAccountSignerSets.createdAt)),
		).toEqual([
			{ accountAddress: S2Address, draftedBy: k1.address },
			{ accountAddress: A, draftedBy: k1.address },
		]);
	});

	test('the legacy create route takes a hand-written enable and refuses a signer change with a 409', async () => {
		const cast = await createCast(session, {
			enable: false,
		});
		const { k1, k2, A, S2 } = cast;
		const legacyCreate = async (transactionBytes: string) =>
			session.client.createProposal({
				multisigAddress: A,
				network: 'localnet',
				transactionBytes,
				signature: await signedBy(k1, transactionBytes),
			});

		const enable = await legacyCreate(
			toBase64(await build(A, buildEnable)),
		);
		await session.voteAndExecute([k2], enable.digest);

		expect(
			await refusal(
				legacyCreate(await buildCastChange(cast, S2)),
			),
		).toEqual({
			status: 409,
			message:
				'A signer change is served by the /v1 routes only.',
		});
	});

	test('labels on a proposal that is not a signer change are refused', async () => {
		const { k1, A } = await createCast(session, {
			enable: false,
		});
		const transactionBytes = await buildTransfer(A);

		expect(
			await refusal(
				session.v1.createProposal({
					accountAddress: A,
					network: 'localnet',
					transactionBytes,
					signature: await signedBy(k1, transactionBytes),
					labels: ['Ana'],
				}),
			),
		).toEqual({
			status: 400,
			message:
				'labels are taken only for a signer change that adds a signer set.',
		});
	});
});
