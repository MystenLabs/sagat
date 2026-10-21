// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Verifying a proposal records the address that signed it for the account
// (`executedVia`), whichever valid signer set, unknown set or single key
// alias that was. The alias changes are executed for real on the local
// network through Sagat proposals; the mirror is then written as the
// refresh would, since there is no refresh yet.

import {
	combineSignerSetSignatures,
	ProposalStatus,
	signerSetPublicKey,
} from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import {
	buildAdd,
	buildEnable,
	fetchAliasSet,
} from '../src/utils/aliases';
import {
	buildTransfer,
	executeSigned,
	failureOf,
	NOT_A_MEMBER,
	signTx,
	untilIndexed,
	type TestUser,
} from './framework/api-test-framework';
import {
	rotationScenario,
	setAliasMirror,
	type RotationScenario,
} from './framework/rotation';
import { setupSharedTestEnvironment } from './setup/shared-test-setup';
import { getLocalClient } from './setup/sui-network';

setupSharedTestEnvironment();

const client = getLocalClient();

describe('Rotation: verify records the executing signer set', () => {
	let s: RotationScenario;

	beforeEach(async () => {
		s = await rotationScenario({ fund: true });
	});

	const build = async (fill: (tx: Transaction) => void) => {
		const tx = new Transaction();
		tx.setSender(s.A);
		fill(tx);
		return (await tx.build({ client })).toBase64();
	};

	const propose = async (
		proposer: TestUser,
		transactionBytes?: string,
	) =>
		s.creator.createProposal(
			proposer,
			s.A,
			'localnet',
			transactionBytes ?? (await buildTransfer(s.A)),
		);

	const stored = (digest: string) =>
		s.framework
			.createSession()
			.v1.getProposalByDigest(digest);

	// Adds `alias` to A's alias set on chain, through two proposals signed
	// by S1 (enable, then add), and mirrors the result as a refresh would.
	const linkOnChain = async (alias: string) => {
		const enable = await propose(
			s.k1,
			await build(buildEnable),
		);
		await s.creator.voteAndExecute([s.k2], enable.digest);
		const add = await propose(
			s.k1,
			await build((tx) =>
				buildAdd(tx, { account: s.A, alias }),
			),
		);
		await s.creator.voteAndExecute([s.k2], add.digest);

		const chain = await fetchAliasSet(client, s.A);
		expect(chain.aliases).toEqual([s.A, alias]);
		await setAliasMirror(s.A, 'localnet', {
			aliases: chain.aliases,
			observedVersion: Number(chain.version),
		});
	};

	test('a proposal executed through the original set records it', async () => {
		const proposal = await propose(s.k1);
		const tx = await s.creator.voteAndExecute(
			[s.k2],
			proposal.digest,
		);
		expect(tx.effects!.status.success).toBe(true);

		expect(await stored(proposal.digest)).toMatchObject({
			status: ProposalStatus.SUCCESS,
			executedVia: s.S1,
		});
		expect(s.S1).toBe(s.A);
	});

	test('a proposal executed through a second linked set records that set, through both verify routes', async () => {
		await linkOnChain(s.S2);

		// Verified with the session route, by a member of S2 only.
		const first = await propose(s.k3);
		await s.creator.voteOnProposal(s.k4, first);
		const { signerSets } = await stored(first.digest);
		const viaS2 = signerSets.find(
			(x) => x.address === s.S2,
		)!;
		expect(viaS2.hasReachedThreshold).toBe(true);
		// S1 has only k3's signature: the legacy pre-check would refuse.
		expect(
			signerSets.find((x) => x.address === s.S1)!
				.hasReachedThreshold,
		).toBe(false);
		await s.creator.executeProposal(first.digest, viaS2);
		expect(
			await (await s.as(s.k4)).verify(first.id),
		).toEqual({ verified: true });
		expect(await stored(first.digest)).toMatchObject({
			status: ProposalStatus.SUCCESS,
			executedVia: s.S2,
		});

		// Verified by digest, with no session.
		const second = await propose(s.k3);
		const tx = await s.creator.voteAndExecute(
			[s.k4],
			second.digest,
			{ via: s.S2 },
		);
		expect(tx.effects!.status.success).toBe(true);
		expect(await stored(second.digest)).toMatchObject({
			status: ProposalStatus.SUCCESS,
			executedVia: s.S2,
		});
	});

	test('a set the mirror does not count as valid is still recorded', async () => {
		// On chain S2 is an alias; the mirror was never refreshed, so Sagat
		// tallies S1 only.
		await linkOnChain(s.S2);
		await setAliasMirror(s.A, 'localnet', {
			exists: false,
		});

		const proposal = await propose(s.k1);
		// k3 signs as a member of S1; k4 cannot vote through Sagat, so its
		// signature is combined outside, as any client can.
		await s.creator.voteOnProposal(s.k3, proposal);
		const k4Signature = await signTx(
			s.k4,
			proposal.transactionBytes,
		);
		const k3Signature = (
			await stored(proposal.digest)
		).signatures.find(
			(sig) => sig.publicKey === s.k3.publicKey,
		)!.signature;
		const s2 = await s.creator.v1.getSignerSet(s.S2);
		expect(signerSetPublicKey(s2).toSuiAddress()).toBe(
			s.S2,
		);
		await executeSigned(proposal.transactionBytes, [
			combineSignerSetSignatures(s2, [
				{
					publicKey: s.k3.publicKey,
					signature: k3Signature,
				},
				{
					publicKey: s.k4.publicKey,
					signature: k4Signature,
				},
			]),
		]);
		await s.creator.verifyByDigest(proposal.digest);

		const after = await stored(proposal.digest);
		expect(after).toMatchObject({
			status: ProposalStatus.SUCCESS,
			executedVia: s.S2,
		});
		expect(after.signerSets.map((x) => x.address)).toEqual([
			s.S1,
		]);
	});

	test('a single key alias is recorded as its own address', async () => {
		const single = new Ed25519Keypair();
		await linkOnChain(single.toSuiAddress());

		const proposal = await propose(s.k1);
		await executeSigned(proposal.transactionBytes, [
			(
				await single.signTransaction(
					fromBase64(proposal.transactionBytes),
				)
			).signature,
		]);
		await s.creator.verifyByDigest(proposal.digest);

		expect(await stored(proposal.digest)).toMatchObject({
			status: ProposalStatus.SUCCESS,
			executedVia: single.toSuiAddress(),
		});
	});

	test('a proposal that was not executed stays pending, with an error', async () => {
		const proposal = await propose(s.k1);
		const notExecuted = {
			status: 400,
			message: 'The transaction has not been executed yet.',
		};
		expect(
			await failureOf(
				s.framework
					.createSession()
					.v1.verifyProposalByDigest(proposal.digest),
			),
		).toEqual(notExecuted);
		expect(
			await failureOf(
				(await s.as(s.k1)).v1.verifyProposal(proposal.id),
			),
		).toEqual(notExecuted);
		expect(await stored(proposal.digest)).toMatchObject({
			status: ProposalStatus.PENDING,
			executedVia: null,
		});
	});

	test('the legacy verify keeps its threshold pre-check', async () => {
		const proposal = await propose(s.k1);
		await expect(
			s.creator.client.verifyProposalByDigest(
				proposal.digest,
			),
		).rejects.toThrow('Proposal is not ready to execute');
	});

	test('the legacy verify records the executing set too, without returning it', async () => {
		const proposal = await propose(s.k1);
		await s.creator.voteOnProposal(s.k2, proposal);
		const { signerSets } = await stored(proposal.digest);
		await s.creator.executeProposal(
			proposal.digest,
			signerSets[0],
		);
		await untilIndexed(() =>
			s.creator.client.verifyProposalByDigest(
				proposal.digest,
			),
		);
		expect(await stored(proposal.digest)).toMatchObject({
			status: ProposalStatus.SUCCESS,
			executedVia: s.S1,
		});
		const [legacy] = (
			await s.creator.client.getProposals(
				s.A,
				'localnet',
				{},
			)
		).data;
		expect(legacy).not.toHaveProperty('executedVia');
	});

	test('verifying with a session needs a member of a valid set', async () => {
		const proposal = await propose(s.k1);
		expect(
			await failureOf(
				(await s.as(s.k5)).v1.verifyProposal(proposal.id),
			),
		).toEqual(NOT_A_MEMBER);
	});
});
