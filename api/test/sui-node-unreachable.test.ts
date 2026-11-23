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
	refusal,
	sign,
} from './framework/api-test-framework';
import {
	insertProposal,
	offlineTransfer,
} from './setup/v1-proposals';

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

	expect(
		await refusal(
			client.addAccountProposer(multisig.address, {
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
			}),
		),
	).toEqual({
		status: 503,
		message: `The signers of account ${multisig.address} on localnet could not be checked. Please try again.`,
	});
	const { accounts } = await client.getAccounts('localnet');
	expect(
		accounts.map(({ address, signerSetsStale }) => ({
			address,
			signerSetsStale,
		})),
	).toEqual([
		{ address: multisig.address, signerSetsStale: true },
	]);
});

test('a /v1 vote is refused with a 503, and the list and the read serve the proposal as not checked', async () => {
	const framework = new ApiTestFramework(
		await createTestApp(),
	);
	const { session, users, multisig } =
		await framework.createVerifiedMultisig(2, 2);
	const client = session.v1;
	const proposal = await insertProposal(
		multisig.address,
		'localnet',
		users[0]!.address,
	);

	const notChecked = {
		status: 503,
		message: `The signers of account ${multisig.address} on localnet could not be checked. Please try again.`,
	};
	expect(
		await refusal(
			session.voteOnProposal(
				users[1]!,
				proposal.digest,
				proposal.transactionBytes,
			),
		),
	).toEqual(notChecked);
	expect(
		await refusal(
			session.createProposal(
				users[0]!,
				multisig.address,
				'localnet',
				await offlineTransfer(multisig.address),
			),
		),
	).toEqual(notChecked);
	const { proposals } = await client.getProposals({
		accountAddress: multisig.address,
		network: 'localnet',
	});
	const read = await client.getProposalByDigest(
		proposal.digest,
	);

	expect(
		[...proposals, read].map(
			({ digest, signerSetsStale }) => ({
				digest,
				signerSetsStale,
			}),
		),
	).toEqual(
		Array(2).fill({
			digest: proposal.digest,
			signerSetsStale: true,
		}),
	);
	expect(read.signatures).toEqual([]);
});
