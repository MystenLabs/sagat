// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MIST_PER_SUI, toBase58 } from '@mysten/sui/utils';

import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';
import {
	executeOutsideApp,
	setupMultisig,
} from '../support/scenarios';

test.describe('errors', () => {
	test('shows why a proposal failed to execute', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		// 1-of-2, so Bob's proposal is ready to execute right away.
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 1,
		});
		await chain.fund(multisig.address);
		const [gasCoin] = await chain.coins(multisig.address);
		// It also spends more than the account holds: the network's dry run
		// doesn't notice a spent gas coin, so this is what makes it fail.
		const transactionBytes =
			await chain.buildOverdrawnSuiTransfer({
				sender: multisig.address,
				recipient: randomAddress(),
				gasCoin,
			});
		const proposal = await bob.api.createProposal({
			multisigAddress: multisig.address,
			transactionBytes,
			signature: await bob.signTransaction(
				transactionBytes,
			),
			network: 'localnet',
		});

		// Another transaction spends the proposal's gas coin first, outside
		// the app, so the network refuses the proposal's transaction.
		await executeOutsideApp(chain, {
			members: [{ identity: alice }, { identity: bob }],
			threshold: 1,
			signers: [bob],
			transactionBytes: await chain.buildSuiTransfer({
				sender: multisig.address,
				recipient: randomAddress(),
				amount: MIST_PER_SUI,
				gasCoin,
			}),
		});

		await alice.signIn();
		await alice.openProposalsTab();
		await alice
			.proposalRow(proposal.digest)
			.getByTestId('proposal-title')
			.click();
		const page = alice.proposalPage(proposal.digest);
		await expect(page).toHaveAttribute(
			'data-status',
			'ready',
		);
		await expect(
			page.getByTestId('proposal-simulation-failed'),
		).toBeVisible();

		// Execute simulates again; still failing, it asks first.
		await page
			.getByTestId('execute-proposal-button')
			.click();
		await alice.page
			.getByTestId('execute-anyway-dialog')
			.getByTestId('execute-anyway-button')
			.click();
		await expect(
			alice.page.locator(
				'[data-sonner-toast][data-type="error"]',
				{ hasText: "Couldn't execute the proposal" },
			),
		).toBeVisible();
		// TODO: it can never execute now, so it should move to a new terminal
		// status (see lookupAndVerifyProposal in the API) instead of staying
		// ready.
		await expect(page).toHaveAttribute(
			'data-status',
			'ready',
		);
	});

	test('a link to an unknown proposal shows an error', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');
		const unknownDigest = toBase58(
			crypto.getRandomValues(new Uint8Array(32)),
		);

		// The link is public, so no wallet is connected.
		await alice.page.goto(
			`/proposals?digest=${unknownDigest}`,
		);

		await expect(
			alice.page.getByTestId('proposal-detail-error'),
		).toBeVisible();
	});
});
