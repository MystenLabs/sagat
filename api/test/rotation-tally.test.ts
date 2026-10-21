// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// How a proposal's signatures count once its account has several signer
// sets (docs/account-rotation.md, "Several signer sets at once" and
// "Pending proposals during a rotation"). Only the sets valid on the
// proposal's network are tallied. `localnet` and `testnet` both point at the
// local network.

import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import {
	ApiTestFramework,
	buildTransfer,
	newUser,
	type TestUser,
} from './framework/api-test-framework';
import {
	rotationScenario,
	setAliasMirror,
	type RotationScenario,
} from './framework/rotation';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

describe('Rotation: tallies', () => {
	let framework: ApiTestFramework;
	let s: RotationScenario;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
		s = await rotationScenario(framework, { fund: true });
	});

	const propose = async (
		proposer: TestUser,
		network: 'localnet' | 'testnet',
	) =>
		s.creator.createProposal(
			proposer,
			s.A,
			network,
			await buildTransfer(s.A),
		);

	const vote = (
		voter: TestUser,
		proposal: { id: number; transactionBytes: string },
	) =>
		s.creator.voteOnProposal(
			voter,
			proposal.id,
			proposal.transactionBytes,
		);

	// The public tally as `[address, currentWeight, hasReachedThreshold]`.
	const tally = async (digest: string) =>
		(
			await framework
				.createSession()
				.v1.getProposalByDigest(digest)
		).signerSets.map((set) => [
			set.address,
			set.currentWeight,
			set.hasReachedThreshold,
		]);

	test('default: only the original signer set is tallied, on every network', async () => {
		for (const network of [
			'localnet',
			'testnet',
		] as const) {
			const proposal = await propose(s.k1, network);
			expect(await tally(proposal.digest)).toEqual([
				[s.S1, 1, false],
			]);
		}
	});

	test('a set linked on localnet is tallied on localnet proposals only, in link order', async () => {
		await setAliasMirror(s.A, 'localnet', {
			aliases: [s.A, s.S2],
		});
		const local = await propose(s.k1, 'localnet');
		const remote = await propose(s.k1, 'testnet');

		const byDigest = await framework
			.createSession()
			.v1.getProposalByDigest(local.digest);
		expect(byDigest.signerSets).toEqual([
			{
				address: s.S1,
				label: 'Treasury',
				threshold: 2,
				totalWeight: 3,
				currentWeight: 1,
				hasReachedThreshold: false,
				members: [s.k1, s.k2, s.k3].map((key, order) => ({
					publicKey: key.publicKey,
					weight: 1,
					order,
					hasSigned: key === s.k1,
				})),
			},
			{
				address: s.S2,
				label: 'Operations',
				threshold: 2,
				totalWeight: 2,
				currentWeight: 0,
				hasReachedThreshold: false,
				members: [s.k3, s.k4].map((key, order) => ({
					publicKey: key.publicKey,
					weight: 1,
					order,
					hasSigned: false,
				})),
			},
		]);
		expect(await tally(remote.digest)).toEqual([
			[s.S1, 1, false],
		]);
	});

	test('a draft is never tallied, even once verified', async () => {
		await setAliasMirror(s.A, 'localnet', {
			aliases: [s.A, s.S2],
		});
		await s.creator.acceptSignerSet(s.k5, s.S3);
		await s.creator.acceptSignerSet(s.k6, s.S3);

		const proposal = await propose(s.k1, 'localnet');
		expect(
			(await tally(proposal.digest)).map(([a]) => a),
		).toEqual([s.S1, s.S2]);
	});

	test('one signature counts toward every valid set that has the key', async () => {
		await setAliasMirror(s.A, 'localnet', {
			aliases: [s.A, s.S2],
		});
		const proposal = await propose(s.k1, 'localnet');

		// k3 is in S1 and S2: S1 reaches 2 of 2, S2 has 1 of 2.
		expect(await vote(s.k3, proposal)).toEqual({
			hasReachedThreshold: true,
			readySignerSets: [s.S1],
		});
		expect(await tally(proposal.digest)).toEqual([
			[s.S1, 2, true],
			[s.S2, 1, false],
		]);
	});

	test('an unknown alias does not change the tally', async () => {
		await setAliasMirror(s.A, 'localnet', {
			aliases: [s.A, newUser().address],
		});
		const proposal = await propose(s.k1, 'localnet');
		expect(await tally(proposal.digest)).toEqual([
			[s.S1, 1, false],
		]);
	});
});
