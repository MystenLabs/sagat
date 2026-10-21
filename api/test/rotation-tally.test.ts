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

import { newUser } from './framework/api-test-framework';
import {
	rotationScenario,
	setAliasMirror,
	type RotationScenario,
} from './framework/rotation';
import { setupSharedTestEnvironment } from './setup/shared-test-setup';

setupSharedTestEnvironment();

describe('Rotation: tallies', () => {
	let s: RotationScenario;

	beforeEach(async () => {
		s = await rotationScenario({ fund: true });
	});

	// The public tally as `[address, currentWeight, hasReachedThreshold]`.
	const tally = async (digest: string) =>
		(
			await s.framework
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
			const proposal = await s.creator.proposeTransfer(
				s.k1,
				s.A,
				{ network: network },
			);
			expect(await tally(proposal.digest)).toEqual([
				[s.S1, 1, false],
			]);
		}
	});

	test('a set linked on localnet is tallied on localnet proposals only, in link order', async () => {
		await setAliasMirror(s.A, 'localnet', {
			aliases: [s.A, s.S2],
		});
		const local = await s.creator.proposeTransfer(
			s.k1,
			s.A,
			{ network: 'localnet' },
		);
		const remote = await s.creator.proposeTransfer(
			s.k1,
			s.A,
			{ network: 'testnet' },
		);

		const byDigest = await s.framework
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

		const proposal = await s.creator.proposeTransfer(
			s.k1,
			s.A,
			{ network: 'localnet' },
		);
		expect(
			(await tally(proposal.digest)).map(([a]) => a),
		).toEqual([s.S1, s.S2]);
	});

	test('one signature counts toward every valid set that has the key', async () => {
		await setAliasMirror(s.A, 'localnet', {
			aliases: [s.A, s.S2],
		});
		const proposal = await s.creator.proposeTransfer(
			s.k1,
			s.A,
			{ network: 'localnet' },
		);

		// k3 is in S1 and S2: S1 reaches 2 of 2, S2 has 1 of 2.
		expect(
			await s.creator.voteOnProposal(s.k3, proposal),
		).toEqual({
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
		const proposal = await s.creator.proposeTransfer(
			s.k1,
			s.A,
			{ network: 'localnet' },
		);
		expect(await tally(proposal.digest)).toEqual([
			[s.S1, 1, false],
		]);
	});
	test('a second signer set reaches its threshold with its own keys', async () => {
		await setAliasMirror(s.A, 'localnet', {
			aliases: [s.A, s.S2],
		});
		const proposal = await s.creator.proposeTransfer(
			s.k1,
			s.A,
			{ network: 'localnet' },
		);
		await s.creator.voteOnProposal(s.k3, proposal);
		expect(
			await s.creator.voteOnProposal(s.k4, proposal),
		).toEqual({
			hasReachedThreshold: true,
			readySignerSets: [s.S1, s.S2],
		});
		expect(await tally(proposal.digest)).toEqual([
			[s.S1, 2, true],
			[s.S2, 2, true],
		]);
	});

	test('a pending proposal across a retire: stored signatures stay, only valid sets count', async () => {
		await setAliasMirror(s.A, 'localnet', {
			aliases: [s.A, s.S2],
		});
		const proposal = await s.creator.proposeTransfer(
			s.k1,
			s.A,
			{ network: 'localnet' },
		);
		expect(
			await s.creator.voteOnProposal(s.k2, proposal),
		).toEqual({
			hasReachedThreshold: true,
			readySignerSets: [s.S1],
		});

		// S1 is retired on localnet.
		await setAliasMirror(s.A, 'localnet', {
			aliases: [s.S2],
		});
		const anonymous = s.framework.createSession().v1;
		const after = await anonymous.getProposalByDigest(
			proposal.digest,
		);
		expect(
			after.signatures.map((sig) => sig.publicKey),
		).toEqual([s.k1.publicKey, s.k2.publicKey]);
		expect(await tally(proposal.digest)).toEqual([
			[s.S2, 0, false],
		]);

		expect(
			await s.creator.voteOnProposal(s.k3, proposal),
		).toEqual({
			hasReachedThreshold: false,
			readySignerSets: [],
		});
		expect(
			await s.creator.voteOnProposal(s.k4, proposal),
		).toEqual({
			hasReachedThreshold: true,
			readySignerSets: [s.S2],
		});
		expect(await tally(proposal.digest)).toEqual([
			[s.S2, 2, true],
		]);
	});

	test('each listed proposal carries the tally of the sets valid on its network', async () => {
		await setAliasMirror(s.A, 'localnet', {
			aliases: [s.A, s.S2],
		});
		const local = await s.creator.proposeTransfer(
			s.k1,
			s.A,
			{ network: 'localnet' },
		);
		await s.creator.voteOnProposal(s.k3, local);
		const remote = await s.creator.proposeTransfer(
			s.k1,
			s.A,
			{ network: 'testnet' },
		);
		const anonymous = s.framework.createSession().v1;
		const k1 = await s.as(s.k1);

		const localPage = await k1.v1.getProposals(
			s.A,
			'localnet',
		);
		// The same item the public lookup returns.
		expect(localPage.data).toEqual([
			await anonymous.getProposalByDigest(local.digest),
		]);
		expect(
			localPage.data[0].signerSets.map((set) => [
				set.address,
				set.currentWeight,
				set.hasReachedThreshold,
			]),
		).toEqual([
			[s.S1, 2, true],
			[s.S2, 1, false],
		]);

		const remotePage = await k1.v1.getProposals(
			s.A,
			'testnet',
		);
		expect(remotePage.data).toEqual([
			await anonymous.getProposalByDigest(remote.digest),
		]);
		expect(
			remotePage.data[0].signerSets.map(
				(set) => set.address,
			),
		).toEqual([s.S1]);
	});

	describe('with S2 as 1-of-2', () => {
		beforeEach(async () => {
			s = await rotationScenario({
				s2Threshold: 1,
				fund: true,
			});
			await setAliasMirror(s.A, 'localnet', {
				aliases: [s.A, s.S2],
			});
		});

		test('a set that would reach its threshold is not ready on a network where it is not valid', async () => {
			const remote = await s.creator.proposeTransfer(
				s.k1,
				s.A,
				{ network: 'testnet' },
			);
			// On localnet k3 alone would make S2 ready.
			expect(
				await s.creator.voteOnProposal(s.k3, remote),
			).toEqual({
				hasReachedThreshold: true,
				readySignerSets: [s.S1],
			});
			expect(await tally(remote.digest)).toEqual([
				[s.S1, 2, true],
			]);

			const local = await s.creator.proposeTransfer(
				s.k3,
				s.A,
				{ network: 'localnet' },
			);
			expect(await tally(local.digest)).toEqual([
				[s.S1, 1, false],
				[s.S2, 1, true],
			]);
		});
	});
});
