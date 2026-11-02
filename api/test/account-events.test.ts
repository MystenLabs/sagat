// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersonalMessages } from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
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
	ProposalStatus,
	SchemaAccountProposers,
	SchemaProposals,
	SchemaProposalSignatures,
} from '../src/db/schema';
import { lockAccount } from '../src/db/transaction';
import { AuthErrors, CommonErrors } from '../src/errors';
import {
	listAccountEvents,
	recordAccountEvent,
	type AccountEvent,
	type AccountEventAction,
	type StoredAccountEvent,
} from '../src/services/account-events.service';
import { verifySignedMessage } from '../src/services/signatures.service';
import { getPublicKeyFromSerializedSignature } from '../src/utils/pubKey';
import {
	ApiTestFramework,
	buildTransfer,
	expectSettled,
	newUser,
	sendCoins,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import { getLocalClient } from './setup/sui-network';

setupSharedTestEnvironment();

let framework: ApiTestFramework;

beforeEach(async () => {
	framework = new ApiTestFramework(await createTestApp());
});

const eventsOf = (
	accountAddress: string,
	member: TestUser,
	action?: AccountEventAction,
) =>
	listAccountEvents({
		accountAddress,
		callerKeys: [member.keypair.getPublicKey()],
		includeProof: true,
		action,
	});

const proposersOf = async (accountAddress: string) =>
	(
		await db
			.select({ address: SchemaAccountProposers.address })
			.from(SchemaAccountProposers)
			.where(
				eq(
					SchemaAccountProposers.accountAddress,
					accountAddress,
				),
			)
	).map((row) => row.address);

const rebuildMessage = (
	{ action, proof, accountAddress }: StoredAccountEvent,
	subject: string,
) => {
	if (
		action === 'proposer.added' &&
		proof?.kind === 'proposer.add'
	)
		return PersonalMessages.addMultisigProposer(
			subject,
			accountAddress,
			proof.expiry,
		);
	if (
		(action === 'proposer.removed' ||
			action === 'proposer.removal_unmatched') &&
		proof?.kind === 'proposer.remove'
	)
		return PersonalMessages.removeMultisigProposer(
			subject,
			accountAddress,
			proof.expiry,
		);
	if (
		action === 'proposal.cancelled' &&
		proof?.kind === 'proposal.cancel'
	)
		return PersonalMessages.cancelProposal(Number(subject));
	throw new Error(
		`No message for action ${action} with proof ${proof?.kind}`,
	);
};

const signatureOf = ({ proof }: StoredAccountEvent) => {
	if (!proof || !('signature' in proof))
		throw new Error('The event has no signature');
	return proof.signature;
};

const expectSignedByActor = async (
	event: StoredAccountEvent,
) => {
	const signer = await verifySignedMessage(
		signatureOf(event),
		rebuildMessage(event, event.subject as string),
	);
	expect(signer.toSuiAddress()).toBe(event.actor);
};

const statusOf = async (proposalId: number) => {
	const [{ status }] = await db
		.select({ status: SchemaProposals.status })
		.from(SchemaProposals)
		.where(eq(SchemaProposals.id, proposalId));
	return status;
};

// One transfer per entry of `proposers`, each paying with its own coin so the
// proposals don't collide. `multisigAddress` must hold no other coins.
const proposeOnOwnCoins = async (
	session: TestSession,
	proposers: TestUser[],
	multisigAddress: string,
) => {
	await sendCoins(multisigAddress, proposers.length);
	const { objects: coins } =
		await getLocalClient().listCoins({
			owner: multisigAddress,
		});
	return Promise.all(
		proposers.map(async (proposer, i) =>
			session.createProposal(
				proposer,
				multisigAddress,
				'localnet',
				await buildTransfer(multisigAddress, {
					gasCoin: coins[i],
				}),
			),
		),
	);
};

// `when` is a trigger condition; by default every insert fails.
const withEventInsertsFailing = async (
	fn: () => Promise<void>,
	when = 'TRUE',
) => {
	await db.execute(sql`
		CREATE FUNCTION refuse_account_event() RETURNS trigger AS $$
		BEGIN RAISE EXCEPTION 'account event refused'; END
		$$ LANGUAGE plpgsql`);
	await db.execute(sql`
		CREATE TRIGGER refuse_account_event BEFORE INSERT ON account_events
		FOR EACH ROW WHEN (${sql.raw(when)})
		EXECUTE FUNCTION refuse_account_event()`);
	try {
		await fn();
	} finally {
		await db.execute(sql`
			DROP TRIGGER refuse_account_event ON account_events`);
		await db.execute(
			sql`DROP FUNCTION refuse_account_event`,
		);
	}
};

describe('the stored proof', () => {
	test('rebuilds the signed message and recovers the actor, after the proposer is gone too', async () => {
		const { session, users, multisig } =
			await framework.createVerifiedMultisig(2, 1);
		// Valid, but not normalised.
		const proposer = newUser().address.toUpperCase();

		await session.addProposer(
			users[0],
			proposer,
			multisig.address,
		);
		await session.removeProposer(
			users[1],
			proposer,
			multisig.address,
		);

		expect(await proposersOf(multisig.address)).toEqual([]);

		const [removed, added] = await eventsOf(
			multisig.address,
			users[0],
		);
		expect(removed).toMatchObject({
			action: 'proposer.removed',
			actor: users[1].address,
			subject: proposer,
			network: null,
			before: null,
			after: null,
		});
		expect(added).toMatchObject({
			action: 'proposer.added',
			actor: users[0].address,
			subject: proposer,
			network: null,
			before: null,
			after: null,
		});

		for (const event of [added, removed]) {
			await expectSignedByActor(event);

			await expect(
				verifySignedMessage(
					signatureOf(event),
					rebuildMessage(event, proposer.toLowerCase()),
				),
			).rejects.toThrow(CommonErrors.InvalidSignature);
		}
	});
});

describe('recording in the change transaction', () => {
	test('a failing event insert leaves no proposer behind', async () => {
		const { session, users, multisig } =
			await framework.createVerifiedMultisig(2, 1);
		const proposer = newUser().address;

		await withEventInsertsFailing(async () => {
			await expect(
				session.addProposer(
					users[0],
					proposer,
					multisig.address,
				),
			).rejects.toThrow();
		});

		expect(await proposersOf(multisig.address)).toEqual([]);

		await session.addProposer(
			users[0],
			proposer,
			multisig.address,
		);
		expect(await proposersOf(multisig.address)).toEqual([
			proposer,
		]);
	});

	test('a failing event insert keeps the proposer and its pending proposal', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const proposer = newUser();

		await session.addProposer(
			users[0],
			proposer.address,
			multisig.address,
		);
		await session.proposeTransfer(
			proposer,
			multisig.address,
		);

		await withEventInsertsFailing(async () => {
			await expect(
				session.removeProposer(
					users[0],
					proposer.address,
					multisig.address,
				),
			).rejects.toThrow();
		});

		expect(await proposersOf(multisig.address)).toEqual([
			proposer.address,
		]);
		const { data } = await session.client.getProposals(
			multisig.address,
			'localnet',
			{},
		);
		expect(data.map((p) => p.status)).toEqual([
			ProposalStatus.PENDING,
		]);
	});

	test('a refused add writes no event', async () => {
		const { session, users, multisig } =
			await framework.createVerifiedMultisig(2, 1);
		const proposer = newUser().address;

		await session.addProposer(
			users[0],
			proposer,
			multisig.address,
		);
		await expect(
			session.addProposer(
				users[0],
				proposer,
				multisig.address,
			),
		).rejects.toThrow('is already a proposer');

		expect(
			await eventsOf(multisig.address, users[0]),
		).toHaveLength(1);
	});

	test('removing someone who is not a proposer succeeds and writes no event', async () => {
		const { session, users, multisig } =
			await framework.createVerifiedMultisig(2, 1);

		await session.removeProposer(
			users[0],
			newUser().address,
			multisig.address,
		);

		expect(
			await eventsOf(multisig.address, users[0]),
		).toEqual([]);
	});
});

describe('cancelling a proposal', () => {
	const proposed = async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const proposal = await session.proposeTransfer(
			users[0],
			multisig.address,
		);
		return { session, users, multisig, proposal };
	};

	// `pg_stat_activity` is cached per transaction, so this must not run in
	// the one holding the lock.
	const untilABackendWaitsOnALock = async () => {
		for (let attempt = 0; attempt < 400; attempt++) {
			const { rows } = await db.execute(sql`
				SELECT 1 FROM pg_stat_activity
				WHERE datname = current_database()
					AND wait_event_type = 'Lock'`);
			if (rows.length > 0) return;
			await Bun.sleep(25);
		}
		throw new Error('No backend is waiting on a lock');
	};

	test('records the signed cancel, once', async () => {
		const { session, users, multisig, proposal } =
			await proposed();

		await session.cancelProposal(users[1], proposal.id);

		const events = await eventsOf(
			multisig.address,
			users[0],
			'proposal.cancelled',
		);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			action: 'proposal.cancelled',
			actor: users[1].address,
			subject: String(proposal.id),
			network: 'localnet',
			before: null,
			after: null,
		});
		await expectSignedByActor(events[0]);

		await expect(
			session.cancelProposal(users[1], proposal.id),
		).rejects.toThrow('Proposal is not pending');
		expect(
			await eventsOf(
				multisig.address,
				users[0],
				'proposal.cancelled',
			),
		).toHaveLength(1);
	});

	test('a refused cancel writes no event', async () => {
		const { session, users, multisig, proposal } =
			await proposed();

		await expect(
			session.cancelProposal(newUser(), proposal.id),
		).rejects.toThrow('Not a member of the multisig');

		expect(
			await eventsOf(
				multisig.address,
				users[0],
				'proposal.cancelled',
			),
		).toEqual([]);
	});

	test('a cancel that lost the race for the lock changes nothing and writes no event', async () => {
		const { session, users, multisig, proposal } =
			await proposed();

		// Wrapped, as returning it bare would make the transaction wait for it.
		const { cancel } = await db.transaction(async (tx) => {
			await lockAccount(tx, multisig.address);

			// Passes the pre-check, then blocks until this transaction commits.
			// Not `expect().rejects`: bun blocks on it right here.
			const cancel = Promise.allSettled([
				session.cancelProposal(users[0], proposal.id),
			]);
			await untilABackendWaitsOnALock();

			await tx
				.update(SchemaProposals)
				.set({ status: ProposalStatus.SUCCESS })
				.where(eq(SchemaProposals.id, proposal.id));

			return { cancel };
		});

		expectSettled(await cancel, {
			fulfilled: 0,
			rejectedWith: 'Proposal is not pending',
		});
		expect(await statusOf(proposal.id)).toBe(
			ProposalStatus.SUCCESS,
		);
		expect(
			await eventsOf(
				multisig.address,
				users[0],
				'proposal.cancelled',
			),
		).toEqual([]);
	});

	const proposedByExternal = async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const proposer = newUser();
		await session.addProposer(
			users[0],
			proposer.address,
			multisig.address,
		);
		const proposal = await session.proposeTransfer(
			proposer,
			multisig.address,
		);
		return { session, users, multisig, proposer, proposal };
	};

	test("records a proposer's cancel with the proposer as actor", async () => {
		const { session, users, multisig, proposer, proposal } =
			await proposedByExternal();

		await session.cancelProposal(proposer, proposal.id);

		const [event, ...others] = await eventsOf(
			multisig.address,
			users[0],
			'proposal.cancelled',
		);
		expect(others).toEqual([]);
		expect(event).toMatchObject({
			actor: proposer.address,
			subject: String(proposal.id),
			network: 'localnet',
		});
		await expectSignedByActor(event);
	});

	test("a proposer's cancel refused for a signed proposal writes no event", async () => {
		const { session, users, multisig, proposer, proposal } =
			await proposedByExternal();
		await session.voteOnProposal(
			users[0],
			proposal.id,
			proposal.transactionBytes,
		);

		await expect(
			session.cancelProposal(proposer, proposal.id),
		).rejects.toThrow(
			'A signer has already signed this proposal',
		);

		expect(
			await eventsOf(
				multisig.address,
				users[0],
				'proposal.cancelled',
			),
		).toEqual([]);
	});

	test('a proposer removed while their cancel waits for the lock is refused', async () => {
		const { session, users, multisig, proposer, proposal } =
			await proposedByExternal();

		// Wrapped, as returning it bare would make the transaction wait for it.
		const { cancel } = await db.transaction(async (tx) => {
			await lockAccount(tx, multisig.address);

			// Not `expect().rejects`: bun blocks on it right here.
			const cancel = Promise.allSettled([
				session.cancelProposal(proposer, proposal.id),
			]);
			await untilABackendWaitsOnALock();

			await tx
				.delete(SchemaAccountProposers)
				.where(
					and(
						eq(
							SchemaAccountProposers.accountAddress,
							multisig.address,
						),
						eq(
							SchemaAccountProposers.address,
							proposer.address,
						),
					),
				);

			return { cancel };
		});

		expectSettled(await cancel, {
			fulfilled: 0,
			rejectedWith: 'Not a member of the multisig',
		});
		expect(await statusOf(proposal.id)).toBe(
			ProposalStatus.PENDING,
		);
		expect(
			await eventsOf(
				multisig.address,
				users[0],
				'proposal.cancelled',
			),
		).toEqual([]);
	});

	test('a failing event insert leaves the proposal pending', async () => {
		const { session, users, multisig, proposal } =
			await proposed();

		await withEventInsertsFailing(async () => {
			await expect(
				session.cancelProposal(users[0], proposal.id),
			).rejects.toThrow();
		});

		expect(await statusOf(proposal.id)).toBe(
			ProposalStatus.PENDING,
		);
		expect(
			await eventsOf(
				multisig.address,
				users[0],
				'proposal.cancelled',
			),
		).toEqual([]);
	});
});

describe('cancelling through a proposer removal', () => {
	test('records each cancelled proposal, caused by the signed removal', async () => {
		const { session, users, multisig } =
			await framework.createVerifiedMultisig(2, 2);
		const proposer = newUser();
		await session.addProposer(
			users[0],
			proposer.address,
			multisig.address,
		);
		const [first, second, unrelated] =
			await proposeOnOwnCoins(
				session,
				[proposer, proposer, users[0]],
				multisig.address,
			);

		await session.removeProposer(
			users[1],
			proposer.address,
			multisig.address,
		);

		const events = await eventsOf(
			multisig.address,
			users[0],
		);
		const [removed] = events.filter(
			(e) => e.action === 'proposer.removed',
		);
		const children = events.filter(
			(e) => e.action === 'proposal.cancelled',
		);

		expect(removed).toMatchObject({
			actor: users[1].address,
			subject: proposer.address,
		});
		await expectSignedByActor(removed);

		expect(children.map((e) => e.subject).sort()).toEqual(
			[first, second].map((p) => String(p.id)).sort(),
		);
		for (const child of children) {
			expect(child).toMatchObject({
				actor: users[1].address,
				network: 'localnet',
				proof: { kind: 'caused_by', eventId: removed.id },
			});
			expect(child.id).toBeGreaterThan(removed.id);
		}

		expect(await statusOf(unrelated.id)).toBe(
			ProposalStatus.PENDING,
		);
	});

	test('a refused event for one proposal rolls the whole removal back', async () => {
		const { session, users, multisig } =
			await framework.createVerifiedMultisig(2, 2);
		const proposer = newUser();
		await session.addProposer(
			users[0],
			proposer.address,
			multisig.address,
		);
		const proposals = await proposeOnOwnCoins(
			session,
			[proposer, proposer],
			multisig.address,
		);
		const eventsBefore = await eventsOf(
			multisig.address,
			users[0],
		);
		// Each insert takes the next id: the removal, a first child, then this
		// one, whichever proposal the removal's UPDATE returned second.
		const secondChild = eventsBefore[0].id + 3;

		await withEventInsertsFailing(async () => {
			await expect(
				session.removeProposer(
					users[0],
					proposer.address,
					multisig.address,
				),
			).rejects.toThrow();
		}, `NEW.action = 'proposal.cancelled' AND NEW.id = ${secondChild}`);

		expect(await proposersOf(multisig.address)).toEqual([
			proposer.address,
		]);
		for (const { id } of proposals)
			expect(await statusOf(id)).toBe(
				ProposalStatus.PENDING,
			);
		expect(
			await eventsOf(multisig.address, users[0]),
		).toEqual(eventsBefore);
	});

	test('removing a member who proposed cancels it under an unmatched removal, not a removed proposer', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const [remover, member] = users;
		const proposal = await session.proposeTransfer(
			member,
			multisig.address,
		);

		await session.removeProposer(
			remover,
			member.address,
			multisig.address,
		);

		expect(await statusOf(proposal.id)).toBe(
			ProposalStatus.CANCELLED,
		);
		const events = await eventsOf(
			multisig.address,
			remover,
		);
		expect(events.map((e) => e.action)).toEqual([
			'proposal.cancelled',
			'proposer.removal_unmatched',
			'proposal.created',
		]);
		const [child, parent] = events;
		expect(parent).toMatchObject({
			action: 'proposer.removal_unmatched',
			actor: remover.address,
			subject: member.address,
		});
		await expectSignedByActor(parent);
		expect(child).toMatchObject({
			action: 'proposal.cancelled',
			actor: remover.address,
			subject: String(proposal.id),
			proof: { kind: 'caused_by', eventId: parent.id },
		});
	});
});

describe('proposal.created', () => {
	const votesOn = (proposalId: number) =>
		db
			.select()
			.from(SchemaProposalSignatures)
			.where(
				eq(SchemaProposalSignatures.proposalId, proposalId),
			);

	// Builds the bytes up front, so only the route call can refuse `propose`.
	const repeatableProposal = async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const transactionBytes = await buildTransfer(
			multisig.address,
		);
		return {
			users,
			multisig,
			propose: () =>
				session.createProposal(
					users[0],
					multisig.address,
					'localnet',
					transactionBytes,
				),
		};
	};

	test('proves an external proposer signed these bytes, with their proposer.added event and no vote', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const proposer = newUser();

		await session.addProposer(
			users[0],
			proposer.address,
			multisig.address,
		);
		const { id } = await session.proposeTransfer(
			proposer,
			multisig.address,
		);

		const [created, added] = await eventsOf(
			multisig.address,
			users[1],
		);
		expect(created).toMatchObject({
			action: 'proposal.created',
			actor: proposer.address,
			subject: String(id),
			before: null,
			after: null,
			proof: { kind: 'proposal.create', version: 1 },
		});
		const [proposal] = await db
			.select()
			.from(SchemaProposals)
			.where(
				eq(SchemaProposals.id, Number(created.subject)),
			);
		expect(created.network).toBe(proposal.network);
		expect(created.actor).toBe(proposal.proposerAddress);

		const signature = signatureOf(created);
		const signer =
			getPublicKeyFromSerializedSignature(signature);
		const bytes = fromBase64(proposal.transactionBytes);
		expect(signer.toSuiAddress()).toBe(created.actor);
		expect(
			await signer.verifyTransaction(bytes, signature),
		).toBe(true);

		expect(Transaction.from(bytes).getData().sender).toBe(
			multisig.address,
		);

		expect(added).toMatchObject({
			action: 'proposer.added',
			subject: created.actor,
		});

		expect(await votesOn(id)).toEqual([]);
	});

	test("records a member's proposal, whose signature is still its first vote", async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);

		const { id } = await session.proposeTransfer(
			users[0],
			multisig.address,
		);

		const [created] = await eventsOf(
			multisig.address,
			users[0],
		);
		expect(created).toMatchObject({
			action: 'proposal.created',
			actor: users[0].address,
			subject: String(id),
			network: 'localnet',
		});
		expect(await votesOn(id)).toEqual([
			{
				proposalId: id,
				publicKey: users[0].publicKey,
				signature: signatureOf(created),
			},
		]);
	});

	test('a failing event insert leaves no proposal and no vote behind', async () => {
		const { multisig, propose } =
			await repeatableProposal();

		await withEventInsertsFailing(async () => {
			await expect(propose()).rejects.toThrow();
		});

		expect(
			await db
				.select()
				.from(SchemaProposals)
				.where(
					eq(
						SchemaProposals.accountAddress,
						multisig.address,
					),
				),
		).toEqual([]);
		expect(
			await db.select().from(SchemaProposalSignatures),
		).toEqual([]);

		const { id } = await propose();
		expect(await votesOn(id)).toHaveLength(1);
	});

	test('a proposal refused past authorization writes no event', async () => {
		const { users, multisig, propose } =
			await repeatableProposal();

		await propose();
		await expect(propose()).rejects.toThrow(
			'A proposal with the same digest already exists.',
		);

		expect(
			await eventsOf(multisig.address, users[0]),
		).toHaveLength(1);
	});
});

describe('listAccountEvents', () => {
	const proposerAdded = (
		accountAddress: string,
		actor: TestUser,
		subject: string,
	): AccountEvent => ({
		action: 'proposer.added',
		accountAddress,
		actor: actor.address,
		subject,
		proof: {
			kind: 'proposer.add',
			version: 1,
			signature: 'signature',
			expiry: 'expiry',
		},
	});

	const seed = (events: AccountEvent[]) =>
		db.transaction(async (tx) => {
			const ids: number[] = [];
			for (const event of events)
				ids.push(await recordAccountEvent(tx, event));
			return ids;
		});

	test('pages newest first, with `before` exclusive and an empty page after the last', async () => {
		const { users, multisig } =
			await framework.createVerifiedMultisig(2, 1);
		const ids = await seed(
			['a', 'b', 'c'].map((subject) =>
				proposerAdded(multisig.address, users[0], subject),
			),
		);
		const page = async (before?: number) =>
			(
				await listAccountEvents({
					accountAddress: multisig.address,
					callerKeys: [users[0].keypair.getPublicKey()],
					limit: 2,
					before,
				})
			).map((e) => e.id);

		expect(await page()).toEqual([ids[2], ids[1]]);
		expect(await page(ids[1])).toEqual([ids[0]]);
		expect(await page(ids[0])).toEqual([]);
	});

	test('a limit above the maximum means the maximum, and no limit means 50', async () => {
		const { users, multisig } =
			await framework.createVerifiedMultisig(2, 1);
		await seed(
			Array.from(
				{ length: LIMITS.maxAccountEventsPerPage + 1 },
				() =>
					proposerAdded(multisig.address, users[0], 'a'),
			),
		);
		const count = async (limit?: number) =>
			(
				await listAccountEvents({
					accountAddress: multisig.address,
					callerKeys: [users[0].keypair.getPublicKey()],
					limit,
				})
			).length;

		expect(await count()).toBe(50);
		expect(
			await count(LIMITS.maxAccountEventsPerPage + 1),
		).toBe(LIMITS.maxAccountEventsPerPage);
	});

	test('only returns the events of the requested account', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);
		const first = await session.createMultisig(users, 1);
		const second = await session.createMultisig(users, 2);
		const [inFirst, inSecond] = await seed([
			proposerAdded(first.address, users[0], 'a'),
			proposerAdded(second.address, users[0], 'b'),
		]);
		const ids = async (accountAddress: string) =>
			(await eventsOf(accountAddress, users[0])).map(
				(e) => e.id,
			);

		expect(await ids(first.address)).toEqual([inFirst]);
		expect(await ids(second.address)).toEqual([inSecond]);
	});

	test('filters by action and by subject', async () => {
		const { users, multisig } =
			await framework.createVerifiedMultisig(2, 1);
		const [addedA, removedA, addedB] = await seed([
			proposerAdded(multisig.address, users[0], 'a'),
			{
				action: 'proposer.removed',
				accountAddress: multisig.address,
				actor: users[0].address,
				subject: 'a',
				proof: {
					kind: 'proposer.remove',
					version: 1,
					signature: 'signature',
					expiry: 'expiry',
				},
			},
			proposerAdded(multisig.address, users[0], 'b'),
		]);
		const ids = async (
			filter: Pick<
				Parameters<typeof listAccountEvents>[0],
				'action' | 'subject'
			>,
		) =>
			(
				await listAccountEvents({
					accountAddress: multisig.address,
					callerKeys: [users[0].keypair.getPublicKey()],
					...filter,
				})
			).map((e) => e.id);

		expect(await ids({ action: 'proposer.added' })).toEqual(
			[addedB, addedA],
		);
		expect(await ids({ subject: 'a' })).toEqual([
			removedA,
			addedA,
		]);
	});

	test('only returns the proof when asked', async () => {
		const { users, multisig } =
			await framework.createVerifiedMultisig(2, 1);
		const event = proposerAdded(
			multisig.address,
			users[0],
			'a',
		);
		await seed([event]);
		const list = (includeProof?: boolean) =>
			listAccountEvents({
				accountAddress: multisig.address,
				callerKeys: [users[0].keypair.getPublicKey()],
				includeProof,
			});

		const [withoutProof] = await list();
		expect(withoutProof.subject).toBe('a');
		expect(withoutProof).not.toHaveProperty('proof');

		const [withProof] = await list(true);
		expect(withProof.proof).toEqual(event.proof);
	});

	test('refuses anyone but an accepted member', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(1);
		const invited = newUser();
		const multisig = await session.createMultisig(
			[users[0], invited],
			1,
		);

		await expect(
			eventsOf(multisig.address, newUser()),
		).rejects.toThrow(AuthErrors.AccessDenied);
		await expect(
			eventsOf(multisig.address, invited),
		).rejects.toThrow(AuthErrors.AccessDenied);
		expect(
			await eventsOf(multisig.address, users[0]),
		).toEqual([]);
	});
});

// The checks that matter are the `@ts-expect-error` lines, enforced by `tsc`.
test('the compiler rejects an event of the wrong shape', () => {
	const accept = (event: AccountEvent) => event;
	const fields = {
		accountAddress: '0xaccount',
		actor: '0xactor',
		subject: '0xproposer',
	};
	const proof = {
		kind: 'proposer.add',
		version: 1,
		signature: 'signature',
		expiry: 'expiry',
	} as const;

	const valid = {
		action: 'proposer.added',
		...fields,
		proof,
	} as const;
	const proofOfAnotherKind = {
		action: 'proposer.removed',
		...fields,
		proof,
	} as const;
	const noProof = {
		action: 'proposer.added',
		...fields,
	} as const;
	const noSubject = {
		action: 'proposer.added',
		accountAddress: fields.accountAddress,
		actor: fields.actor,
		proof,
	} as const;
	const unexpectedBefore = {
		...valid,
		before: { name: 'old' },
	} as const;
	const unknownAction = {
		...valid,
		action: 'proposer.renamed',
	} as const;
	const proposalWithoutNetwork = {
		action: 'proposal.created',
		...fields,
		proof: {
			kind: 'proposal.create',
			version: 1,
			signature: 'signature',
		},
	} as const;
	const cancelWithAnotherKind = {
		action: 'proposal.cancelled',
		...fields,
		network: 'localnet',
		proof,
	} as const;

	accept(valid);
	// @ts-expect-error a removal takes the removal proof.
	accept(proofOfAnotherKind);
	// @ts-expect-error a cancel takes its own proof or a `caused_by` one.
	accept(cancelWithAnotherKind);
	// @ts-expect-error the proof is required.
	accept(noProof);
	// @ts-expect-error the subject is required.
	accept(noSubject);
	// @ts-expect-error this action stores no `before`.
	accept(unexpectedBefore);
	// @ts-expect-error not in the registry.
	accept(unknownAction);
	accept({
		...proposalWithoutNetwork,
		network: 'localnet',
	});
	// @ts-expect-error a proposal's network is required.
	accept(proposalWithoutNetwork);
});
