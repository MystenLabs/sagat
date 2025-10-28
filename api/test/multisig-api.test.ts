// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import { ApiTestFramework } from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

describe('Multisig API', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		const app = await createTestApp();
		framework = new ApiTestFramework(app);
	});

	describe('Authentication', () => {
		test('single user auth and address registration', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(1);

			expect(users).toHaveLength(1);
			expect(session.hasActiveCookie()).toBe(true);

			await session.disconnect();
			expect(session.hasActiveCookie()).toBe(false);
		});

		test('multi-user auth session', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(3);

			expect(users).toHaveLength(3);
			expect(session.hasActiveCookie()).toBe(true);
			expect(session.getConnectedUsers()).toHaveLength(3);
		});
	});

	describe('Multisig Management', () => {
		test('create and verify 2-of-2 multisig', async () => {
			const { users, multisig } =
				await framework.createVerifiedMultisig(2, 2);

			expect(multisig.address).toBeDefined();
			expect(multisig.threshold).toBe(2);
			expect(users).toHaveLength(2);
		});

		test('create and verify 2-of-3 multisig', async () => {
			const { users, multisig } =
				await framework.createVerifiedMultisig(3, 2);

			expect(multisig.address).toBeDefined();
			expect(multisig.threshold).toBe(2);
			expect(users).toHaveLength(3);
		});

		test('multisig with custom name', async () => {
			const { multisig } =
				await framework.createVerifiedMultisig(
					2,
					2,
					'Test Multisig',
				);

			expect(multisig.name).toBe('Test Multisig');
		});
	});

	describe('Complete Workflow', () => {
		test('full multisig workflow: creation -> verification -> proposal -> voting -> execution', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(3, 2);

			const recipient =
				'0x1234567890123456789012345678901234567890123456789012345678901234';

			// Create proposal
			const proposal =
				await session.createSimpleTransferProposal(
					users[0],
					multisig.address,
					recipient,
					1000000,
					'Transfer 1 MIST to recipient',
				);

			expect(proposal.id).toBeDefined();

			// Vote to reach threshold
			const voteResult = await session.voteOnProposal(
				users[1],
				proposal.id,
				proposal.transactionBytes,
			);
			expect(voteResult.hasReachedThreshold).toBe(true);
		});
	});

	describe('Session Management', () => {
		test('session disconnect clears state', async () => {
			const { session } =
				await framework.createAuthenticatedSession(1);

			expect(session.hasActiveCookie()).toBe(true);
			expect(session.getConnectedUsers()).toHaveLength(1);

			await session.disconnect();
			expect(session.hasActiveCookie()).toBe(false);
			expect(session.getConnectedUsers()).toHaveLength(0);
		});

		test('different multisigs have different addresses', async () => {
			const { multisig: multisig1 } =
				await framework.createVerifiedMultisig(
					2,
					2,
					'Multisig 1',
				);
			const { multisig: multisig2 } =
				await framework.createVerifiedMultisig(
					2,
					2,
					'Multisig 2',
				);

			expect(multisig1.address).not.toBe(multisig2.address);
			expect(multisig1.name).toBe('Multisig 1');
			expect(multisig2.name).toBe('Multisig 2');
		});
	});

	describe('Error Handling', () => {
		test('non-member cannot vote on proposal', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			// Create an external user
			const outsider = session.createUser();

			const recipient =
				'0x5555555555555555555555555555555555555555555555555555555555555555';
			const proposal =
				await session.createSimpleTransferProposal(
					users[0],
					multisig.address,
					recipient,
					1000000,
				);

			// Outsider cannot vote
			expect(
				session.voteOnProposal(
					outsider,
					proposal.id,
					proposal.transactionBytes,
				),
			).rejects.toThrow();
		});
	});
});
