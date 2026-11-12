// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { fromBase64 } from '@mysten/sui/utils';
import { expect, test } from 'bun:test';

import {
	ApiTestFramework,
	buildTransfer,
	errorOf,
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
