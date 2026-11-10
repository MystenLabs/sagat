// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	defaultExpiry,
	PersonalMessages,
	ProposalStatus,
} from '@mysten/sagat';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';
import { and, eq, sql } from 'drizzle-orm';

import { LIMITS } from '../src/constants/limits';
import { db } from '../src/db';
import {
	SchemaAccounts,
	SchemaProposals,
	SchemaProposalSignatures,
} from '../src/db/schema';
import { AuthErrors, CommonErrors } from '../src/errors';
import { ProposalByDigestLoader } from '../src/loaders/proposals.loader';
import { SignerSetDataLoader } from '../src/loaders/signer-set.loader';
import {
	ApiTestFramework,
	buildTransfer,
	errorOf,
	expectSettled,
	newUser,
	sendCoins,
	sign,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import { rpcCalls } from './setup/rpc-calls';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import { getLocalClient } from './setup/sui-network';

const client = getLocalClient();

setupSharedTestEnvironment();

describe('Proposal Business Logic', () => {
	let framework: ApiTestFramework;

	const proposerLimitResponse = {
		status: 400,
		body: {
			error:
				'You have reached the maximum number of proposers for this multisig',
		},
	};

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	describe('Transaction Validation', () => {
		test('rejects proposal when signature is for a different transaction', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			const signed = await buildTransfer(multisig.address, {
				amount: 500_000,
			});
			const submitted = await buildTransfer(
				multisig.address,
				{ amount: 999_999 },
			);
			const { signature } =
				await users[0].keypair.signTransaction(
					fromBase64(signed),
				);

			await expect(
				session.client.createProposal({
					multisigAddress: multisig.address,
					network: 'localnet',
					transactionBytes: submitted,
					signature,
				}),
			).rejects.toThrow(/Invalid Sui signature/);
		});

		test('checks the signature before any RPC work', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			// A pending proposal, whose objects a new one is checked against.
			await session.proposeTransfer(
				users[0],
				multisig.address,
			);

			const { signature } =
				await users[0].keypair.signTransaction(
					fromBase64(await buildTransfer(multisig.address)),
				);
			const before = await rpcCalls('getObjects');
			await expect(
				session.client.createProposal({
					multisigAddress: multisig.address,
					network: 'localnet',
					transactionBytes: await buildTransfer(
						multisig.address,
						{ amount: 999_999 },
					),
					signature,
				}),
			).rejects.toThrow(/Invalid Sui signature/);
			expect(await rpcCalls('getObjects')).toBe(before);
		});

		test('prevents duplicate proposals with same transaction digest', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			// Without an expiration, the node picks one with a random nonce
			// when it selects gas, so pin it: the same PTB must then build to
			// the same digest.
			const [{ chainIdentifier }, { systemState }] =
				await Promise.all([
					client.getChainIdentifier(),
					client.getCurrentSystemState(),
				]);
			const epoch = BigInt(systemState.epoch);
			const buildPinnedTransfer = async () => {
				const tx = new Transaction();
				tx.setSender(multisig.address);
				tx.setExpiration({
					ValidDuring: {
						minEpoch: String(epoch),
						maxEpoch: String(epoch + 1n),
						minTimestamp: null,
						maxTimestamp: null,
						chain: chainIdentifier,
						nonce: 0,
					},
				});
				const [coin] = tx.splitCoins(tx.gas, [1000000]);
				tx.transferObjects([coin], multisig.address);
				const bytes = (
					await tx.build({ client })
				).toBase64();
				return { bytes, digest: await tx.getDigest() };
			};

			// Build identical transactions
			const tx1 = await buildPinnedTransfer();
			const tx2 = await buildPinnedTransfer();
			expect(tx2.digest).toBe(tx1.digest);

			await session.createProposal(
				users[0],
				multisig.address,
				'localnet',
				tx1.bytes,
			);

			await expect(
				session.createProposal(
					users[0],
					multisig.address,
					'localnet',
					tx2.bytes,
				),
			).rejects.toThrow(/same digest/);
		});

		test('verifying a proposal that was never executed is a client error', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 1);

			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);

			await expect(
				session.client.verifyProposalByDigest(
					proposal.digest,
				),
			).rejects.toThrow(/has not been executed yet/);
		});
	});

	test('weighs votes by member weight', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(3);
		const multisig = await session.createMultisig(
			users,
			3,
			{
				weights: [1, 2, 1],
				fund: true,
			},
		);
		await session.acceptMultisig(
			users[1],
			multisig.address,
		);

		const proposal = await session.proposeTransfer(
			users[0],
			multisig.address,
		);

		// 1 + 1 out of 3.
		expect(
			await session.voteOnProposal(
				users[2],
				proposal.id,
				proposal.transactionBytes,
			),
		).toEqual({
			hasReachedThreshold: false,
			currentWeight: 2,
		});
		// 1 + 1 + 2 out of 3.
		expect(
			await session.voteOnProposal(
				users[1],
				proposal.id,
				proposal.transactionBytes,
			),
		).toEqual({
			hasReachedThreshold: true,
			currentWeight: 4,
		});
	});

	describe('Vote Validation', () => {
		test('prevents duplicate voting by same member', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);

			// The proposer already voted by proposing.
			await expect(
				session.voteOnProposal(
					users[0],
					proposal.id,
					proposal.transactionBytes,
				),
			).rejects.toThrow('already voted');
		});

		test('rejects vote when signature is for a different transaction', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(3, 2);

			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);
			const { signature } =
				await users[1].keypair.signTransaction(
					fromBase64(
						await buildTransfer(multisig.address, {
							amount: 999_999,
						}),
					),
				);

			await expect(
				session.client.voteForProposal(proposal.id, {
					signature,
				}),
			).rejects.toThrow(/Invalid Sui signature/);
		});
	});

	describe('Member Access Control', () => {
		test('only members who accepted can propose', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(1);
			const invitee = newUser();
			const multisig = await session.createMultisig(
				[users[0], invitee],
				2,
				{ fund: true },
			);

			await expect(
				session.proposeTransfer(invitee, multisig.address),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);
		});

		test('non-members cannot propose or vote', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const outsider = newUser();

			await expect(
				session.proposeTransfer(outsider, multisig.address),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);

			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);
			await expect(
				session.voteOnProposal(
					outsider,
					proposal.id,
					proposal.transactionBytes,
				),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);
		});
	});

	describe('Proposer Access Control', () => {
		// A new user, added as an external proposer of the multisig by a member.
		const addNewProposer = async (
			session: TestSession,
			member: TestUser,
			multisig: { address: string },
		) => {
			const proposer = newUser();
			await session.addProposer(
				member,
				proposer.address,
				multisig.address,
			);
			return proposer;
		};

		test('Only members can add proposers', async () => {
			const { session, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const outsider = newUser();

			await expect(
				session.addProposer(
					outsider,
					outsider.address,
					multisig.address,
				),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);
		});

		test('Try to add proposer with expired signature', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			await expect(
				session.addProposer(
					users[0],
					newUser().address,
					multisig.address,
					'2021-01-01',
				),
			).rejects.toThrow('Signature has expired');
		});

		test('Add proposer, propose, remove proposer, try to propose and fail', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const proposer = await addNewProposer(
				session,
				users[0],
				multisig,
			);
			await session.proposeTransfer(
				proposer,
				multisig.address,
			);

			await session.removeProposer(
				users[0],
				proposer.address,
				multisig.address,
			);

			// Removing the proposer cancels their proposals.
			const { data } = await session.client.getProposals(
				multisig.address,
				'localnet',
				{},
			);
			expect(data.map((p) => p.status)).toEqual([
				ProposalStatus.CANCELLED,
			]);

			await expect(
				session.proposeTransfer(proposer, multisig.address),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);
		});

		test('rejects a proposal from a proposer removed while it waited on the account lock', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const proposer = await addNewProposer(
				session,
				users[0],
				multisig,
			);

			// `pg_stat_activity` is cached per transaction, so this must not run
			// in the one holding the lock.
			const untilBackendsWaitOnALock = async (
				count: number,
			) => {
				for (let attempt = 0; attempt < 400; attempt++) {
					const { rows } = await db.execute(sql`
						SELECT 1 FROM pg_stat_activity
						WHERE datname = current_database()
							AND wait_event_type = 'Lock'`);
					if (rows.length >= count) return;
					await Bun.sleep(25);
				}
				throw new Error(
					`Fewer than ${count} backends are waiting on a lock`,
				);
			};

			// Wrapped, as returning them bare would make the transaction wait for
			// them. Not `expect().rejects`: bun blocks on it right here.
			const { removal, creation } = await db.transaction(
				async (tx) => {
					await tx
						.select({ address: SchemaAccounts.address })
						.from(SchemaAccounts)
						.where(
							eq(SchemaAccounts.address, multisig.address),
						)
						.for('no key update');

					// Row lock waiters are served in order, so the removal commits
					// first, after the create has passed its check before the lock.
					const removal = Promise.allSettled([
						session.removeProposer(
							users[0],
							proposer.address,
							multisig.address,
						),
					]);
					await untilBackendsWaitOnALock(1);
					const creation = Promise.allSettled([
						session.proposeTransfer(
							proposer,
							multisig.address,
						),
					]);
					await untilBackendsWaitOnALock(2);

					return { removal, creation };
				},
			);

			expect((await removal)[0].status).toBe('fulfilled');
			expectSettled(await creation, {
				fulfilled: 0,
				rejectedWith: AuthErrors.NotAMultisigMember,
			});
			expect(
				await db
					.select({ id: SchemaProposals.id })
					.from(SchemaProposals)
					.where(
						and(
							eq(
								SchemaProposals.accountAddress,
								multisig.address,
							),
							eq(
								SchemaProposals.proposerAddress,
								proposer.address,
							),
						),
					),
			).toEqual([]);
		});

		test('an external proposer cancels their own unsigned proposal', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const proposer = await addNewProposer(
				session,
				users[0],
				multisig,
			);
			const proposal = await session.proposeTransfer(
				proposer,
				multisig.address,
			);

			await session.cancelProposal(proposer, proposal);

			const { data } = await session.client.getProposals(
				multisig.address,
				'localnet',
				{},
			);
			expect(data.map((p) => p.status)).toEqual([
				ProposalStatus.CANCELLED,
			]);
		});

		test('an external proposer cannot cancel once a member has signed', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const proposer = await addNewProposer(
				session,
				users[0],
				multisig,
			);
			const proposal = await session.proposeTransfer(
				proposer,
				multisig.address,
			);
			await session.voteOnProposal(
				users[0],
				proposal.id,
				proposal.transactionBytes,
			);

			await expect(
				session.cancelProposal(proposer, proposal),
			).rejects.toThrow(
				'A signer has already signed this proposal',
			);

			const { data } = await session.client.getProposals(
				multisig.address,
				'localnet',
				{},
			);
			expect(data.map((p) => p.status)).toEqual([
				ProposalStatus.PENDING,
			]);
		});

		test("an external proposer cannot cancel someone else's proposal", async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const proposerA = await addNewProposer(
				session,
				users[0],
				multisig,
			);
			const proposerB = await addNewProposer(
				session,
				users[0],
				multisig,
			);

			const proposalByA = await session.proposeTransfer(
				proposerA,
				multisig.address,
			);
			await expect(
				session.cancelProposal(proposerB, proposalByA),
			).rejects.toThrow('Not a member of the multisig');

			// Frees the coins for the next proposal.
			await session.cancelProposal(users[0], proposalByA);

			const proposalByMember =
				await session.proposeTransfer(
					users[0],
					multisig.address,
				);
			await expect(
				session.cancelProposal(proposerA, proposalByMember),
			).rejects.toThrow('Not a member of the multisig');
		});

		test('keeps the proposer limit for simultaneous adds', async () => {
			const { session, users, multisig } =
				await framework.createVerifiedMultisig(2, 2);
			const add = (proposer: TestUser) =>
				session.addProposer(
					users[0],
					proposer.address,
					multisig.address,
				);
			// Added together, which also opens enough database connections
			// for the two adds below to overlap.
			await Promise.all(
				Array.from(
					{ length: LIMITS.maxProposersPerMultisig - 1 },
					() => add(newUser()),
				),
			);

			const results = await Promise.allSettled(
				[newUser(), newUser()].map(add),
			);

			expectSettled(results, {
				fulfilled: 1,
				rejectedWith: proposerLimitResponse.body.error,
			});
		});
	});

	test('a new proposal can be fetched by digest, with the proposer signature', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);

		const proposal = await session.proposeTransfer(
			users[0],
			multisig.address,
			'Test proposal',
		);

		const byDigest =
			await session.client.getProposalByDigest(
				proposal.digest,
			);
		expect(byDigest).toMatchObject(proposal);
		expect(byDigest.signatures).toMatchObject([
			{ publicKey: users[0].publicKey },
		]);
	});

	test('a malformed key does not fail the rest of its loader batch', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const proposal = await session.proposeTransfer(
			users[0],
			multisig.address,
		);

		const [byDigest, badDigest, signerSet, badAddress] =
			await Promise.all([
				ProposalByDigestLoader.load(proposal.digest),
				ProposalByDigestLoader.load('\0'),
				SignerSetDataLoader.load(multisig.address),
				SignerSetDataLoader.load('\0'),
			]);
		expect(byDigest?.digest).toBe(proposal.digest);
		expect(badDigest).toBeNull();
		expect(signerSet?.address).toBe(multisig.address);
		expect(badAddress).toBeNull();
	});

	test('Get paginated proposals', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		await sendCoins(multisig.address, 10);
		const { objects: coins } = await client.listCoins({
			owner: multisig.address,
			limit: 20,
		});

		// Each with its own gas coin, so they don't collide.
		for (const gasCoin of coins.slice(0, 10)) {
			await session.createProposal(
				users[0],
				multisig.address,
				'localnet',
				await buildTransfer(multisig.address, { gasCoin }),
			);
		}

		const ids = new Set<number>();
		let cursor: number | undefined;
		do {
			const page = await session.client.getProposals(
				multisig.address,
				'localnet',
				{ nextCursor: cursor, perPage: 1 },
			);
			expect(page.data).toHaveLength(1);
			ids.add(page.data[0].id);
			cursor = page.hasNextPage
				? Number(page.nextCursor)
				: undefined;
		} while (cursor !== undefined);

		expect(ids.size).toBe(10);
	});

	test('filters proposals by status, including PENDING', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);

		const cancelled = await session.proposeTransfer(
			users[0],
			multisig.address,
		);
		await session.cancelProposal(users[0], cancelled);
		const pending = await session.createProposal(
			users[0],
			multisig.address,
			'localnet',
			await buildTransfer(multisig.address, {
				amount: 2_000_000,
			}),
		);

		const listByStatus = async (status: ProposalStatus) =>
			(
				await session.client.getProposals(
					multisig.address,
					'localnet',
					{ status },
				)
			).data.map((p) => ({ id: p.id, status: p.status }));

		expect(
			await listByStatus(ProposalStatus.PENDING),
		).toEqual([
			{ id: pending.id, status: ProposalStatus.PENDING },
		]);
		expect(
			await listByStatus(ProposalStatus.CANCELLED),
		).toEqual([
			{
				id: cancelled.id,
				status: ProposalStatus.CANCELLED,
			},
		]);
	});

	describe('Proposal Cancellation', () => {
		test('a cancelled proposal takes no more votes or cancels', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);

			await session.cancelProposal(users[0], proposal);

			await expect(
				session.voteOnProposal(
					users[1],
					proposal.id,
					proposal.transactionBytes,
				),
			).rejects.toThrow('Proposal is not pending');
			await expect(
				session.cancelProposal(users[0], proposal),
			).rejects.toThrow('Proposal is not pending');
		});

		test('non-member cannot cancel a proposal', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);

			await expect(
				session.cancelProposal(newUser(), proposal),
			).rejects.toThrow('Not a member of the multisig');
		});
	});

	// Status, body and check order of the error responses, locked so that a
	// refactor of the flows cannot change them unnoticed.
	describe('Error responses', () => {
		const notAMember = {
			status: 403,
			body: { error: AuthErrors.NotAMultisigMember },
		};
		const invalidSignature = {
			status: 400,
			body: { error: CommonErrors.InvalidSignature },
		};
		const unsupportedNetwork = {
			status: 400,
			body: {
				error:
					'Unsupported network: mainnet. Only localnet are supported.',
			},
		};

		const votesOn = (proposalId: number) =>
			db
				.select({
					publicKey: SchemaProposalSignatures.publicKey,
				})
				.from(SchemaProposalSignatures)
				.where(
					eq(
						SchemaProposalSignatures.proposalId,
						proposalId,
					),
				);

		const changeProposer = async (
			session: TestSession,
			route: 'add-proposer' | 'remove-proposer',
			{
				signer,
				multisigAddress,
				proposer,
				expiry = defaultExpiry(),
				signedExpiry = expiry,
			}: {
				signer: TestUser;
				multisigAddress: string;
				proposer: string;
				expiry?: string;
				// The expiry in the signed message, if not `expiry`.
				signedExpiry?: string;
			},
		) => {
			const message =
				route === 'add-proposer'
					? PersonalMessages.addMultisigProposer(
							proposer,
							multisigAddress,
							signedExpiry,
						)
					: PersonalMessages.removeMultisigProposer(
							proposer,
							multisigAddress,
							signedExpiry,
						);
			return errorOf(
				await session.post(
					`/multisig/${multisigAddress}/${route}`,
					{
						signature: await sign(signer, message),
						proposer,
						expiry,
					},
				),
			);
		};

		test('add-proposer checks the expiry, then the address, then membership, then the signature', async () => {
			const { session, users, multisig } =
				await framework.createVerifiedMultisig(2, 2);
			const outsider = newUser();
			const add = (
				options: Omit<
					Parameters<typeof changeProposer>[2],
					'multisigAddress'
				>,
			) =>
				changeProposer(session, 'add-proposer', {
					multisigAddress: multisig.address,
					...options,
				});

			expect(
				await add({
					signer: outsider,
					proposer: 'not-an-address',
					expiry: 'not-a-date',
				}),
			).toEqual({
				status: 400,
				body: { error: 'Invalid expiry date format' },
			});
			expect(
				await add({
					signer: outsider,
					proposer: 'not-an-address',
					expiry: '2021-01-01',
				}),
			).toEqual({
				status: 400,
				body: { error: 'Signature has expired' },
			});
			expect(
				await add({
					signer: outsider,
					proposer: 'not-an-address',
				}),
			).toEqual({
				status: 400,
				body: {
					error:
						'Invalid address. Must be a valid Sui address.',
				},
			});
			expect(
				await add({
					signer: outsider,
					proposer: newUser().address,
				}),
			).toEqual(notAMember);
			expect(
				await add({
					signer: users[0],
					proposer: newUser().address,
					signedExpiry: new Date(
						Date.now() + 60_000,
					).toISOString(),
				}),
			).toEqual({
				status: 400,
				body: { error: 'Invalid signature for message.' },
			});
		});

		test('add-proposer refuses a proposer that is already there', async () => {
			const { session, users, multisig } =
				await framework.createVerifiedMultisig(2, 2);
			const proposer = newUser().address;
			await session.addProposer(
				users[0],
				proposer,
				multisig.address,
			);

			expect(
				await changeProposer(session, 'add-proposer', {
					signer: users[1],
					multisigAddress: multisig.address,
					proposer,
				}),
			).toEqual({
				status: 400,
				body: {
					error: `${proposer} is already a proposer for this multisig`,
				},
			});
		});

		test('add-proposer checks the proposer limit before duplicates', async () => {
			const { session, users, multisig } =
				await framework.createVerifiedMultisig(2, 2);
			const proposers = Array.from(
				{ length: LIMITS.maxProposersPerMultisig },
				() => newUser().address,
			);
			for (const proposer of proposers)
				await session.addProposer(
					users[0],
					proposer,
					multisig.address,
				);

			expect(
				await changeProposer(session, 'add-proposer', {
					signer: users[0],
					multisigAddress: multisig.address,
					proposer: newUser().address,
				}),
			).toEqual(proposerLimitResponse);
			// At the limit, even a proposer that is already there gets the
			// limit error, not the duplicate one.
			expect(
				await changeProposer(session, 'add-proposer', {
					signer: users[0],
					multisigAddress: multisig.address,
					proposer: proposers[0],
				}),
			).toEqual(proposerLimitResponse);
		});

		test('remove-proposer checks the expiry, then the address, then membership', async () => {
			const { session, multisig } =
				await framework.createVerifiedMultisig(2, 2);
			const outsider = newUser();

			expect(
				await changeProposer(session, 'remove-proposer', {
					signer: outsider,
					multisigAddress: multisig.address,
					proposer: 'not-an-address',
					expiry: '2021-01-01',
				}),
			).toEqual({
				status: 400,
				body: { error: 'Signature has expired' },
			});
			expect(
				await changeProposer(session, 'remove-proposer', {
					signer: outsider,
					multisigAddress: multisig.address,
					proposer: 'not-an-address',
				}),
			).toEqual({
				status: 400,
				body: {
					error:
						'Invalid address. Must be a valid Sui address.',
				},
			});
			expect(
				await changeProposer(session, 'remove-proposer', {
					signer: outsider,
					multisigAddress: multisig.address,
					proposer: newUser().address,
				}),
			).toEqual(notAMember);
		});

		test('verify-by-digest refuses a malformed digest', async () => {
			const { session } =
				await framework.createAuthenticatedSession(1);

			expect(
				await errorOf(
					await session.post(
						'/proposals/%00/verify-by-digest',
						{},
					),
				),
			).toEqual({
				status: 400,
				body: { error: CommonErrors.InvalidDigest },
			});
		});

		test('a transaction over the size cap is refused before it is parsed', async () => {
			const session = framework.createSession();

			expect(
				await errorOf(
					await session.post('/proposals', {
						multisigAddress: newUser().address,
						// One base64 group (3 bytes) over the limit.
						transactionBytes: toBase64(
							new Uint8Array(
								LIMITS.maxTransactionBytes + 3,
							),
						),
						signature: 'not-a-signature',
						network: 'localnet',
					}),
				),
			).toEqual({
				status: 400,
				body: {
					error: 'The transaction is too large.',
				},
			});
		});

		test('a transaction with another gas owner is refused', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			const tx = Transaction.from(
				await buildTransfer(multisig.address),
			);
			tx.setGasOwner(newUser().address);
			const bytes = await tx.build();
			const { signature } =
				await users[0].keypair.signTransaction(bytes);

			expect(
				await errorOf(
					await session.post('/proposals', {
						multisigAddress: multisig.address,
						transactionBytes: toBase64(bytes),
						signature,
						network: 'localnet',
					}),
				),
			).toEqual({
				status: 400,
				body: {
					error:
						'The transaction gas owner does not match the account.',
				},
			});
		});

		test('a request body over the size cap is refused with a 413', async () => {
			const session = framework.createSession();

			const response = await session.post('/proposals', {
				transactionBytes: 'a'.repeat(
					LIMITS.maxRequestBodyBytes,
				),
			});
			expect(response.status).toBe(413);
		});

		test('an unsupported network is checked before anything else', async () => {
			const { session } =
				await framework.createAuthenticatedSession(1);
			const multisigAddress = newUser().address;

			// Creating: before the signature is even parsed.
			expect(
				await errorOf(
					await session.post('/proposals', {
						multisigAddress,
						transactionBytes: 'not-a-transaction',
						signature: 'not-a-signature',
						network: 'mainnet',
					}),
				),
			).toEqual(unsupportedNetwork);

			// Listing: before the membership check.
			const list = async (network: string) =>
				errorOf(
					await session.request(
						`/proposals?multisigAddress=${multisigAddress}&network=${network}`,
					),
				);
			expect(await list('mainnet')).toEqual(
				unsupportedNetwork,
			);
			expect(await list('localnet')).toEqual(notAMember);
		});

		test('votes and cancels by non-members, and their check order', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const outsider = newUser();
			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);

			const vote = async (
				voter: TestUser,
				proposalId: number,
				bytes: Uint8Array,
			) =>
				errorOf(
					await session.post(
						`/proposals/${proposalId}/vote`,
						{
							signature: (
								await voter.keypair.signTransaction(bytes)
							).signature,
						},
					),
				);
			const cancel = async (
				member: TestUser,
				proposalId: number,
				message = PersonalMessages.cancelProposal(
					proposal.digest,
					multisig.address,
				),
			) =>
				errorOf(
					await session.post(
						`/proposals/${proposalId}/cancel`,
						{ signature: await sign(member, message) },
					),
				);

			// The proposal is looked up first.
			expect(
				await vote(
					outsider,
					proposal.id + 1000,
					fromBase64(proposal.transactionBytes),
				),
			).toEqual({
				status: 400,
				body: { error: 'Proposal not found' },
			});

			// A vote: 403 for a non-member, before its signature is checked.
			expect(
				await vote(
					outsider,
					proposal.id,
					new Uint8Array([1, 2, 3]),
				),
			).toEqual(notAMember);

			// A cancel: 400 for a non-member, before its signature is checked.
			expect(
				await cancel(
					outsider,
					proposal.id,
					'Something else',
				),
			).toEqual({
				status: 400,
				body: { error: 'Not a member of the multisig' },
			});
			expect(
				await cancel(
					users[0],
					proposal.id,
					'Something else',
				),
			).toEqual({
				status: 400,
				body: { error: 'Invalid signature for message.' },
			});

			// Once cancelled, the status is checked before membership.
			await session.cancelProposal(users[0], proposal);
			expect(await cancel(outsider, proposal.id)).toEqual({
				status: 400,
				body: { error: 'Proposal is not pending' },
			});
			expect(
				await vote(
					outsider,
					proposal.id,
					fromBase64(proposal.transactionBytes),
				),
			).toEqual(notAMember);
		});

		test('a signature the parser cannot read gets a 400', async () => {
			const { session, multisig } =
				await framework.createVerifiedMultisig(2, 2);
			const addProposer = async (signature: string) =>
				errorOf(
					await session.post(
						`/multisig/${multisig.address}/add-proposer`,
						{
							signature,
							proposer: newUser().address,
							expiry: defaultExpiry(),
						},
					),
				);

			// An unknown scheme flag.
			expect(await addProposer('QQ==')).toEqual(
				invalidSignature,
			);
			// Too short to hold a public key.
			expect(await addProposer('AAAA')).toEqual(
				invalidSignature,
			);
		});

		test('a signature with extra bytes inside it gets a 400 and stores nothing', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);
			const votesBefore = await votesOn(proposal.id);

			// The key stays readable at the end of the signature.
			const withExtraBytes = (signature: string) => {
				const bytes = fromBase64(signature);
				const keyStart = bytes.length - 32;
				return toBase64(
					new Uint8Array([
						...bytes.slice(0, keyStart),
						...new Uint8Array(16),
						...bytes.slice(keyStart),
					]),
				);
			};

			expect(
				await errorOf(
					await session.post(
						`/proposals/${proposal.id}/cancel`,
						{
							signature: withExtraBytes(
								await sign(
									users[0],
									PersonalMessages.cancelProposal(
										proposal.digest,
										multisig.address,
									),
								),
							),
						},
					),
				),
			).toEqual(invalidSignature);

			const { signature } =
				await users[1].keypair.signTransaction(
					fromBase64(proposal.transactionBytes),
				);
			expect(
				await errorOf(
					await session.post(
						`/proposals/${proposal.id}/vote`,
						{ signature: withExtraBytes(signature) },
					),
				),
			).toEqual({
				status: 400,
				body: {
					error:
						'Invalid Sui signature for the proposed transaction.',
				},
			});

			const [stored] = await db
				.select({ status: SchemaProposals.status })
				.from(SchemaProposals)
				.where(eq(SchemaProposals.id, proposal.id));
			expect(stored.status).toBe(ProposalStatus.PENDING);
			expect(await votesOn(proposal.id)).toEqual(
				votesBefore,
			);
		});

		test('a signature scheme we do not support keeps its own error', async () => {
			const { session, users, multisig } =
				await framework.createVerifiedMultisig(2, 2);
			const signature = MultiSigPublicKey.fromPublicKeys({
				threshold: 1,
				publicKeys: [
					{
						publicKey: users[0].keypair.getPublicKey(),
						weight: 1,
					},
				],
			}).combinePartialSignatures([
				await sign(users[0], 'A message'),
			]);

			expect(
				await errorOf(
					await session.post(
						`/multisig/${multisig.address}/add-proposer`,
						{
							signature,
							proposer: newUser().address,
							expiry: defaultExpiry(),
						},
					),
				),
			).toEqual({
				status: 400,
				body: {
					error:
						'Invalid signature scheme. Only Ed25519, Secp256k1, and Secp256r1 are supported. zkLogin wallets are not supported.',
				},
			});
		});
	});
});
