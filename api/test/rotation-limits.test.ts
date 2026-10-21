// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The cap on what a key can be part of counts accounts, not signer sets
// (docs/account-rotation.md, "Limits"): a key carried over into a new
// signer set of the same account counts once.

import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import { LIMITS } from '../src/constants/limits';
import {
	ApiTestFramework,
	failureOf,
	newUser,
} from './framework/api-test-framework';
import { draftSignerSet } from './framework/rotation';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

describe('Rotation: key cap', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	test('counts accounts, not signer sets', async () => {
		const key = newUser();
		const session = framework.createSession();
		await session.connectUser(key);

		// The key is in the original set of as many accounts as the cap
		// allows before refusing, accepted on creation.
		const accounts: string[] = [];
		for (
			let i = 0;
			i < LIMITS.maxMultisigsPerPublicKey;
			i++
		)
			accounts.push(
				(await session.createSignerSet([key, newUser()], 1))
					.address,
			);
		// And carried over, accepted, into a second signer set of the first
		// account: one more signer set, the same account.
		await draftSignerSet(accounts[0], [key, newUser()], 1, {
			accepted: [key],
		});

		// Invitations to two more accounts.
		const invite = async () => {
			const other = framework.createSession();
			const owner = newUser();
			await other.connectUser(owner);
			return (await other.createSignerSet([owner, key], 2))
				.address;
		};
		const next = await invite();
		const overCap = await invite();

		// Counting signer sets, the key would already be over the cap.
		expect(
			await session.acceptSignerSet(key, next),
		).toMatchObject({ address: next, isVerified: true });
		expect(
			await failureOf(
				session.acceptSignerSet(key, overCap),
			),
		).toEqual({
			status: 400,
			message:
				'You have reached the maximum number of multisigs for this public key',
		});
	});
});
