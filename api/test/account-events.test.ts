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
import { eq, sql } from 'drizzle-orm';

import { LIMITS } from '../src/constants/limits';
import { db } from '../src/db';
import {
	ProposalStatus,
	SchemaAccountProposers,
	SchemaProposals,
	SchemaProposalSignatures,
} from '../src/db/schema';
import { AuthErrors, CommonErrors } from '../src/errors';
import {
	listAccountEvents,
	recordAccountEvent,
	type AccountEvent,
	type StoredAccountEvent,
} from '../src/services/account-events.service';
import { verifySignedMessage } from '../src/services/signatures.service';
import { getPublicKeyFromSerializedSignature } from '../src/utils/pubKey';
import {
	ApiTestFramework,
	buildTransfer,
	newUser,
	type TestUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

let framework: ApiTestFramework;

beforeEach(async () => {
	framework = new ApiTestFramework(await createTestApp());
});

const eventsOf = (
	accountAddress: string,
	member: TestUser,
) =>
	listAccountEvents({
		accountAddress,
		callerKeys: [member.keypair.getPublicKey()],
		includeProof: true,
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
		action === 'proposer.removed' &&
		proof?.kind === 'proposer.remove'
	)
		return PersonalMessages.removeMultisigProposer(
			subject,
			accountAddress,
			proof.expiry,
		);
	throw new Error(
		`No message for action ${action} with proof ${proof?.kind}`,
	);
};

const signatureOf = ({ proof }: StoredAccountEvent) => {
	if (!proof || !('signature' in proof))
		throw new Error('The event has no signature');
	return proof.signature;
};

const withEventInsertsFailing = async (
	fn: () => Promise<void>,
) => {
	await db.execute(sql`
		CREATE FUNCTION refuse_account_event() RETURNS trigger AS $$
		BEGIN RAISE EXCEPTION 'account event refused'; END
		$$ LANGUAGE plpgsql`);
	await db.execute(sql`
		CREATE TRIGGER refuse_account_event BEFORE INSERT ON account_events
		FOR EACH ROW EXECUTE FUNCTION refuse_account_event()`);
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
			const signer = await verifySignedMessage(
				signatureOf(event),
				rebuildMessage(event, event.subject as string),
			);
			expect(signer.toSuiAddress()).toBe(event.actor);

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

	test('proves an external proposer signed these bytes and a member added that proposer, with no vote', async () => {
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

		const otherBytes = bytes.slice();
		otherBytes[otherBytes.length - 1] ^= 1;
		expect(
			await signer.verifyTransaction(otherBytes, signature),
		).toBe(false);
		expect(Transaction.from(bytes).getData().sender).toBe(
			multisig.address,
		);

		expect(added.action).toBe('proposer.added');
		expect(added.subject).toBe(created.actor);
		const adder = await verifySignedMessage(
			signatureOf(added),
			rebuildMessage(added, added.subject as string),
		);
		expect(adder.toSuiAddress()).toBe(users[0].address);

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

	test('an out-of-range limit means the maximum, and no limit means 50', async () => {
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
			await count(LIMITS.maxAccountEventsPerPage),
		).toBe(LIMITS.maxAccountEventsPerPage);
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

	accept(valid);
	// @ts-expect-error a removal takes the removal proof.
	accept(proofOfAnotherKind);
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
