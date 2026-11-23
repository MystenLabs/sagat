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
	signedBy,
} from './framework/api-test-framework';
import { changeProposer } from './setup/v1-accounts';
import {
	insertProposal,
	offlineTransfer,
} from './setup/v1-proposals';

// The app reads this on load; restore it for this worker's other files.
const previousRpcUrl = process.env.SUI_RPC_URL_localnet;
process.env.SUI_RPC_URL_localnet = 'http://127.0.0.1:1';
const { createTestApp, setupSharedTestEnvironment } =
	await import('./setup/shared-test-setup');
const { ageAliasState, setAliases } =
	await import('./setup/acting-sets');
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
	// Fresh, so the check for a changed account reads nothing.
	await setAliases(multisig.address, 'localnet', [
		multisig.address,
	]);
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

test('a /v1 write is refused with a 503, and the lists and the read serve the account and the proposal as not checked', async () => {
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
			changeProposer(
				framework,
				'add',
				users[0]!,
				multisig.address,
				newUser().address,
			),
		),
	).toEqual(notChecked);
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
	const { accounts } = await client.getAccounts('localnet');
	const { proposals } = await client.getProposals({
		accountAddress: multisig.address,
		network: 'localnet',
	});
	const read = await client.getProposalByDigest(
		proposal.digest,
	);

	expect(
		[...accounts, ...proposals, read].map(
			({ signerSetsStale }) => signerSetsStale,
		),
	).toEqual([true, true, true]);
	expect(accounts[0].address).toBe(multisig.address);
	expect(
		[...proposals, read].map(({ digest }) => digest),
	).toEqual([proposal.digest, proposal.digest]);
	expect(read.signatures).toEqual([]);
});

test('a legacy write is refused with a 503, and a legacy read serves an unchanged account from the mirror and still refuses and leaves out one whose aged mirror says it changed', async () => {
	const framework = new ApiTestFramework(
		await createTestApp(),
	);
	const { session, users, multisig } =
		await framework.createVerifiedMultisig(2, 2);
	const account = multisig.address;
	const proposal = await insertProposal(
		account,
		'localnet',
		users[0]!.address,
	);
	const transactionBytes = await offlineTransfer(account);
	const proposer = newUser().address;
	const expiry = defaultExpiry();
	const changed = (
		await session.createMultisig([users[0]!, newUser()], 1)
	).address;
	await setAliases(changed, 'localnet', [
		newUser().address,
	]);
	await ageAliasState(changed, 'localnet');

	const notChecked = {
		status: 503,
		body: {
			error: `The signers of account ${account} on localnet could not be checked. Please try again.`,
		},
	};
	expect(
		await errorOf(
			await session.post('/proposals', {
				multisigAddress: account,
				network: 'localnet',
				transactionBytes,
				signature: await signedBy(
					users[0]!,
					transactionBytes,
				),
			}),
		),
	).toEqual(notChecked);
	expect(
		await errorOf(
			await session.post(`/proposals/${proposal.id}/vote`, {
				signature: await signedBy(
					users[1]!,
					proposal.transactionBytes,
				),
			}),
		),
	).toEqual(notChecked);
	expect(
		await errorOf(
			await session.post(
				`/multisig/${account}/add-proposer`,
				{
					proposer,
					expiry,
					signature: await sign(
						users[0]!,
						PersonalMessages.addMultisigProposer(
							proposer,
							account,
							expiry,
						),
					),
				},
			),
		),
	).toEqual(notChecked);

	expect(
		(await session.client.getMultisig(account)).address,
	).toBe(account);
	expect(
		(
			await session.client.getProposals(
				account,
				'localnet',
				{},
			)
		).data.map((p) => p.id),
	).toEqual([proposal.id]);
	expect(
		(
			await session.client.getProposalByDigest(
				proposal.digest,
			)
		).id,
	).toBe(proposal.id);
	expect(
		await errorOf(
			await session.request(`/multisig/${changed}`),
		),
	).toEqual({
		status: 409,
		body: {
			error:
				'An account whose signers changed is served by the /v1 routes only.',
		},
	});
	const listed = Object.values(
		await session.client.getMultisigConnections(),
	)
		.flat()
		.map((m) => m.address);
	expect(listed).toContain(account);
	expect(listed).not.toContain(changed);
});
