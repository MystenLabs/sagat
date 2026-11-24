// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Signing, reading and cancelling a signer change, through the routes on the
// local network, with the cast of `setup/signer-changes`.

import { PersonalMessages } from '@mysten/sagat';
import { type Proposal } from '@mysten/sagat/v1';
import {
	beforeEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db';
import {
	ProposalStatus,
	SchemaAccountAliases,
	SchemaProposals,
} from '../src/db/schema';
import { ApiAuthError } from '../src/errors';
import {
	ApiTestFramework,
	buildTransfer,
	executeProposal,
	newUser,
	refusal,
	sign,
	signedBy,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import { answerFor, setAliases } from './setup/acting-sets';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import {
	addressOf,
	buildCastChange,
	createCast,
	gasCoins,
	proposeCastChange,
} from './setup/signer-changes';
import { changeProposer } from './setup/v1-accounts';

setupSharedTestEnvironment();
setDefaultTimeout(60_000);

const SERVED_BY_V1 = {
	status: 409,
	body: {
		error:
			'A signer change is served by the /v1 routes only.',
	},
};

describe('signing and cancelling a signer change', () => {
	let framework: ApiTestFramework;
	let session: TestSession;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
		session = framework.createSession();
	});

	// A request's status and its body as sent, so a stripped field cannot hide.
	const raw = async (
		path: string,
		init?: { method: string; body: unknown },
	) => {
		const response = await session.request(
			path,
			init && {
				method: init.method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(init.body),
			},
		);
		return {
			status: response.status,
			text: await response.text(),
		};
	};

	const vote = (digest: string, signature: string) =>
		raw(`/v1/proposals/${digest}/vote`, {
			method: 'POST',
			body: { signature },
		});

	const cancelSignature = (
		key: TestUser,
		{ digest, accountAddress }: Proposal,
	) =>
		sign(
			key,
			PersonalMessages.cancelProposal(
				digest,
				accountAddress,
			),
		);

	const sorted = (keys: string[]) => [...keys].sort();

	test('S1 to S2: ready at the old set’s threshold with its signatures returned; legacy routes leave the change out or refuse it until it executes', async () => {
		const cast = await createCast(session);
		const { k1, k2, k3, A, S2 } = cast;
		const bytes = await buildCastChange(cast, S2);
		const signatures = await Promise.all(
			[k1, k2, k3].map((key) => signedBy(key, bytes)),
		);
		const [sig1, sig2, sig3] = signatures;
		const returned = (text: string) =>
			signatures.filter((sig) => text.includes(sig));

		const create = await raw(
			'/v1/proposals?network=localnet',
			{
				method: 'POST',
				body: {
					accountAddress: A,
					transactionBytes: bytes,
					signature: sig1,
				},
			},
		);
		expect(create.status).toBe(201);
		expect(returned(create.text)).toEqual([sig1]);
		const created = JSON.parse(create.text) as Proposal;
		const { digest } = created;
		const [{ id }] = await db
			.select({ id: SchemaProposals.id })
			.from(SchemaProposals)
			.where(eq(SchemaProposals.digest, digest));

		const afterK3 = await vote(digest, sig3);
		const voted = JSON.parse(afterK3.text) as Proposal;
		expect(voted.signerSets).toEqual([
			expect.objectContaining({
				address: A,
				threshold: 2,
				currentWeight: 2,
			}),
		]);
		expect(voted.kind).toBe('signer_change');
		expect(voted.ready).toBe(true);
		expect(voted.signerChange).toEqual({
			removes: A,
			adds: addressOf(S2),
		});
		expect(
			sorted(voted.signatures.map((s) => s.publicKey)),
		).toEqual(sorted([k1.publicKey, k3.publicKey]));
		expect(
			sorted(voted.signatures.map((s) => s.signature)),
		).toEqual(sorted([sig1, sig3]));
		expect(voted.events.created?.proof).toEqual({
			kind: 'proposal.create',
			version: 1,
			signature: sig1,
		});

		const reads = [
			await raw(`/v1/proposals/${digest}`),
			await raw(
				`/v1/proposals?accountAddress=${A}&network=localnet`,
			),
		];
		for (const read of reads) {
			expect(read.status).toBe(200);
			expect(read.text).toContain(digest);
			expect(sorted(returned(read.text))).toEqual(
				sorted([sig1, sig3]),
			);
		}

		const legacyList = await raw(
			`/proposals?multisigAddress=${A}&network=localnet`,
		);
		expect(legacyList.status).toBe(200);
		expect(legacyList.text).not.toContain(digest);
		// A page whose only row is left out still moves the cursor, to the enable.
		const firstPage = JSON.parse(
			(
				await raw(
					`/proposals?multisigAddress=${A}&network=localnet&perPage=1`,
				)
			).text,
		);
		expect(firstPage).toMatchObject({
			data: [],
			hasNextPage: true,
			nextCursor: String(id),
		});
		const secondPage = JSON.parse(
			(
				await raw(
					`/proposals?multisigAddress=${A}&network=localnet&perPage=1&nextCursor=${id}`,
				)
			).text,
		);
		expect(secondPage.data).toHaveLength(1);
		const legacy = [
			await raw(`/proposals/digest/${digest}`),
			await raw(`/proposals/${id}/vote`, {
				method: 'POST',
				body: { signature: sig2 },
			}),
			await raw(`/proposals/${id}/cancel`, {
				method: 'POST',
				body: {
					signature: await cancelSignature(k2, created),
				},
			}),
		];
		for (const refused of legacy)
			expect({
				status: refused.status,
				body: JSON.parse(refused.text),
			}).toEqual(SERVED_BY_V1);

		const executed = await executeProposal(
			voted,
			voted.signerSets[0],
		);
		expect(executed.effects.status.success).toBe(true);
		for (const path of [
			`/proposals/${digest}/verify-by-digest`,
			`/proposals/${id}/verify`,
		])
			expect(
				await raw(path, { method: 'POST', body: {} }),
			).toEqual({
				status: 200,
				text: JSON.stringify({ verified: true }),
			});
	});

	test('a key of another acting set cannot sign a change', async () => {
		const cast = await createCast(session);
		const { k4, A, S2 } = cast;
		const R = await session.createMultisig(
			[k4, newUser()],
			1,
		);
		const created = await proposeCastChange(
			session,
			cast,
			S2,
		);
		await setAliases(A, 'localnet', [R.address]);

		expect(
			await refusal(
				session.voteOnProposal(
					k4,
					created.digest,
					created.transactionBytes,
				),
			),
		).toEqual({
			status: 403,
			message: new ApiAuthError('NotASignerOfTheOldSet')
				.message,
		});
	});

	test('a removed signer cannot cancel a change, also not by removing its proposer, and a signer who stays can', async () => {
		const cast = await createCast(session);
		const { k1, k2, k3, A, S2 } = cast;
		const coins = await gasCoins(A, 2);
		const transfer = await session.createProposal(
			k1,
			A,
			'localnet',
			await buildTransfer(A, { gasCoin: coins[0] }),
		);
		const created = await proposeCastChange(
			session,
			cast,
			S2,
			{
				gasCoin: coins[1],
			},
		);

		expect(
			await refusal(session.cancelProposal(k3, created)),
		).toEqual({
			status: 403,
			message: new ApiAuthError('CancelBySignerWhoStays')
				.message,
		});

		await changeProposer(
			framework,
			'remove',
			k3,
			A,
			k1.address,
		);
		const statusOf = async (digest: string) =>
			(
				await db
					.select({ status: SchemaProposals.status })
					.from(SchemaProposals)
					.where(eq(SchemaProposals.digest, digest))
			)[0].status;
		expect(await statusOf(transfer.digest)).toBe(
			ProposalStatus.CANCELLED,
		);
		expect(await statusOf(created.digest)).toBe(
			ProposalStatus.PENDING,
		);

		expect(
			(await session.cancelProposal(k2, created)).status,
		).toBe('CANCELLED');
	});

	test('once the old set no longer acts, an accepted signer of the set that acts cancels the change', async () => {
		const cast = await createCast(session);
		const { k4, A, S2 } = cast;
		const R = await session.createMultisig(
			[k4, newUser()],
			1,
		);
		const created = await proposeCastChange(
			session,
			cast,
			S2,
		);
		await setAliases(A, 'localnet', [R.address]);
		await db
			.delete(SchemaAccountAliases)
			.where(
				and(
					eq(SchemaAccountAliases.accountAddress, A),
					eq(SchemaAccountAliases.aliasAddress, A),
				),
			);
		await answerFor(A, k4, 'accepted');

		expect(
			(await session.cancelProposal(k4, created)).status,
		).toBe('CANCELLED');
	});
});
