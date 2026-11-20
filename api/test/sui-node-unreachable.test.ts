// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	defaultExpiry,
	PersonalMessages,
} from '@mysten/sagat';
import { fromBase64 } from '@mysten/sui/utils';
import { expect, test } from 'bun:test';

import {
	ApiTestFramework,
	buildTransfer,
	errorOf,
	newUser,
	sign,
} from './framework/api-test-framework';

// The app reads this on load; restore it for this worker's other files.
const previousRpcUrl = process.env.SUI_RPC_URL_localnet;
process.env.SUI_RPC_URL_localnet = 'http://127.0.0.1:1';
const { createTestApp, setupSharedTestEnvironment } =
	await import('./setup/shared-test-setup');
if (previousRpcUrl === undefined)
	delete process.env.SUI_RPC_URL_localnet;
else process.env.SUI_RPC_URL_localnet = previousRpcUrl;

setupSharedTestEnvironment();

test('a request whose Sui node call fails gets a 502', async () => {
	const framework = new ApiTestFramework(
		await createTestApp(),
	);
	const { session, users, multisig } =
		await framework.createFundedVerifiedMultisig(2, 1);
	const transactionBytes = await buildTransfer(
		multisig.address,
	);
	const { signature } =
		await users[0]!.keypair.signTransaction(
			fromBase64(transactionBytes),
		);

	expect(
		await errorOf(
			await session.post('/proposals', {
				multisigAddress: multisig.address,
				network: 'localnet',
				transactionBytes,
				signature,
			}),
		),
	).toEqual({
		status: 502,
		body: {
			error:
				'The Sui network could not be reached. Please try again.',
		},
	});
});

test('a /v1 write is refused with a 503, and the list serves the account as not checked', async () => {
	const framework = new ApiTestFramework(
		await createTestApp(),
	);
	const { session, users, multisig } =
		await framework.createVerifiedMultisig(2, 1);
	const client = session.v1;
	const proposer = newUser().address;
	const expiry = defaultExpiry();

	const refused = await client
		.addAccountProposer(multisig.address, {
			network: 'localnet',
			proposer,
			signature: await sign(
				users[0]!,
				PersonalMessages.addMultisigProposer(
					proposer,
					multisig.address,
					expiry,
				),
			),
			expiry,
		})
		.catch((error) => error);
	const { accounts } = await client.getAccounts('localnet');

	expect({
		status: refused.status,
		message: refused.message,
	}).toEqual({
		status: 503,
		message: `The signers of account ${multisig.address} on localnet could not be checked. Please try again.`,
	});
	expect(
		accounts.map(({ address, signersChecked }) => ({
			address,
			signersChecked,
		})),
	).toEqual([
		{ address: multisig.address, signersChecked: false },
	]);
});
