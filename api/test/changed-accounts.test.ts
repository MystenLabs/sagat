// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The legacy routes refuse an account whose signers changed on any supported network.

import { buildAdd, buildEnable } from '@mysten/sagat';
import {
	beforeEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '../src/db';
import { SchemaAccountAliasState } from '../src/db/schema';
import { ServedByV1OnlyError } from '../src/errors';
import { refuseChangedAccount } from '../src/services/changed-accounts.service';
import {
	ApiTestFramework,
	buildTransfer,
	errorOf,
	newUser,
	signedBy,
} from './framework/api-test-framework';
import {
	ageAliasState,
	SERVED_BY_V1,
	setAliases,
} from './setup/acting-sets';
import {
	expectSuccess,
	multisigSigner,
	run,
} from './setup/localnet-transactions';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();
setDefaultTimeout(60_000);

let framework: ApiTestFramework;

beforeEach(async () => {
	framework = new ApiTestFramework(await createTestApp());
});

describe('changed accounts', () => {
	test('an account changed on one network is refused on all, and only when that network is checked', async () => {
		const { multisig } =
			await framework.createVerifiedMultisig(2, 1);
		const account = multisig.address;
		// Fresh on testnet, so no testnet node is read.
		await setAliases(account, 'testnet', [
			account,
			newUser().address,
		]);

		await expect(
			refuseChangedAccount(account, 'write', {
				networks: ['localnet', 'testnet'],
			}),
		).rejects.toBeInstanceOf(ServedByV1OnlyError);
		await refuseChangedAccount(account, 'write', {
			networks: ['localnet'],
		});
	});

	test('refuses an account whose stale alias state refreshes to a signer change, but not one that only enabled signer changes', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const account = multisig.address;
		const signer = multisigSigner(
			'A',
			users.map((user) => user.keypair),
			2,
		);
		const read = async () =>
			errorOf(
				await session.request(`/multisig/${account}`),
			);
		const stateExists = async () =>
			(
				await db
					.select({
						exists: SchemaAccountAliasState.exists,
					})
					.from(SchemaAccountAliasState)
					.where(
						eq(
							SchemaAccountAliasState.accountAddress,
							account,
						),
					)
			)[0].exists;
		expect((await read()).status).toBe(200);

		expectSuccess(await run(account, signer, buildEnable));
		await ageAliasState(account, 'localnet');
		expect((await read()).status).toBe(200);
		expect(await stateExists()).toBe(true);
		const transactionBytes = await buildTransfer(account);
		const created = await session.post('/proposals', {
			multisigAddress: account,
			network: 'localnet',
			transactionBytes,
			signature: await signedBy(
				users[0]!,
				transactionBytes,
			),
		});
		expect(created.status).toBe(201);

		expectSuccess(
			await run(account, signer, (tx) =>
				buildAdd(tx, { account, alias: newUser().address }),
			),
		);
		await ageAliasState(account, 'localnet');
		expect(await read()).toEqual(SERVED_BY_V1);
	});
});
