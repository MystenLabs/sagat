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
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db';
import {
	SchemaAccountAliases,
	SchemaAccountAliasState,
} from '../src/db/schema';
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
import { enableSignerChanges } from './setup/signer-changes';

setupSharedTestEnvironment();
setDefaultTimeout(60_000);

let framework: ApiTestFramework;

beforeEach(async () => {
	framework = new ApiTestFramework(await createTestApp());
});

const SERVED_BY_V1 = {
	status: 409,
	body: {
		error:
			'An account whose signers changed is served by the /v1 routes only.',
	},
};

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

	test('an account that only enabled signer changes is not refused', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const account = multisig.address;
		await enableSignerChanges(session, account, users);
		expect(
			await db
				.select({
					alias: SchemaAccountAliases.aliasAddress,
				})
				.from(SchemaAccountAliases)
				.where(
					and(
						eq(
							SchemaAccountAliases.accountAddress,
							account,
						),
						eq(SchemaAccountAliases.network, 'localnet'),
					),
				),
		).toEqual([{ alias: account }]);

		const read = await session.request(
			`/multisig/${account}`,
		);
		expect(read.status).toBe(200);
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
	});

	test('a stale alias state is refreshed before the decision', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const account = multisig.address;
		expect(
			(await session.request(`/multisig/${account}`))
				.status,
		).toBe(200);

		const signer = multisigSigner(
			'A',
			users.map((user) => user.keypair),
			2,
		);
		const other = newUser().address;
		for (const fill of [
			buildEnable,
			(tx: Parameters<typeof buildEnable>[0]) =>
				buildAdd(tx, { account, alias: other }),
		])
			expectSuccess(await run(account, signer, fill));
		await ageAliasState(account, 'localnet');

		expect(
			await errorOf(
				await session.request(`/multisig/${account}`),
			),
		).toEqual(SERVED_BY_V1);
		const [state] = await db
			.select({ exists: SchemaAccountAliasState.exists })
			.from(SchemaAccountAliasState)
			.where(
				eq(SchemaAccountAliasState.accountAddress, account),
			);
		expect(state.exists).toBe(true);
	});
});
