// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MIST_PER_SUI } from '@mysten/sui/utils';

import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';
import {
	chooseType,
	clickNewProposal,
	expectSimulation,
	fillTransfer,
	pasteBytes,
	proposeAndSign,
	reviewBytes,
	reviewTransfer,
} from '../support/new-proposal';
import {
	proposeTransfer,
	setupMultisig,
	signProposal,
} from '../support/scenarios';

test.describe('proposals', () => {
	test('members propose, co-sign and execute a SUI transfer', async ({
		createActor,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = await createActor('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
		});
		await chain.fund(multisig.address);
		const recipient = randomAddress();

		// Alice proposes a transfer from the SUI row on the Assets page.
		await alice.signIn();
		await alice.page
			.getByTestId('multisig-tab-assets')
			.click();
		await alice
			.suiBalanceRow()
			.getByTestId('asset-send-button')
			.click();
		await fillTransfer(alice.page, {
			amount: '1.5',
			recipient,
			title: 'Pay 1.5 SUI',
		});
		await reviewTransfer(alice.page);
		await expectSimulation(alice.page, 'success');
		await proposeAndSign(alice.page);

		// Proposing counts as Alice's signature.
		const aliceCard =
			alice.page.getByTestId('proposal-row');
		await expect(aliceCard).toHaveAttribute(
			'data-status',
			'pending',
		);
		await expect(
			aliceCard.getByTestId('proposal-weight'),
		).toHaveAttribute('data-current-weight', '1');
		await expect(
			aliceCard.getByTestId('proposal-already-signed'),
		).toBeVisible();
		const digest =
			await aliceCard.getAttribute('data-digest');
		expect(digest).toBeTruthy();

		// Bob co-signs, which makes it executable, then executes it.
		await bob.signIn();
		await bob.openProposalsTab();
		const bobCard = bob.proposalRow(digest!);
		await bobCard
			.getByTestId('proposal-toggle-details')
			.click();
		// The preview opens in its own row under the proposal's.
		await bob.page
			.getByTestId('sign-proposal-button')
			.click();
		await expect(bobCard).toHaveAttribute(
			'data-status',
			'ready',
		);
		await bobCard
			.getByTestId('execute-proposal-button')
			.click();
		// The success toast names the transaction. Suiscan doesn't index
		// localnet, so there is no explorer link here.
		const toast = bob.page.locator(
			'[data-sonner-toast][data-type="success"]',
			{ hasText: 'Proposal executed' },
		);
		await expect(toast).toContainText(digest!);
		await expect(
			toast.getByRole('button', { name: /explorer/i }),
		).toHaveCount(0);
		await expect(bobCard).toHaveAttribute(
			'data-status',
			'executed',
		);

		// The transfer really happened on-chain.
		expect(await chain.balance(recipient)).toBe(
			(3n * MIST_PER_SUI) / 2n,
		);

		// Alice sees the outcome too.
		await alice.page.reload();
		await expect(
			alice.proposalRow(digest!),
		).toHaveAttribute('data-status', 'executed');
	});

	test('pending proposals show when they expire', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = createIdentity('alice');
		const bob = await createActor('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
		});
		await chain.fund(multisig.address);
		const [expiringGas, lastingGas] = await chain.coins(
			multisig.address,
		);
		const transfer = {
			multisigAddress: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
		};
		// Only valid until the end of the next epoch.
		const expiring = await proposeTransfer(chain, alice, {
			...transfer,
			gasCoin: expiringGas,
			expiration: { Epoch: (await chain.epoch()) + 1 },
		});
		const lasting = await proposeTransfer(chain, alice, {
			...transfer,
			gasCoin: lastingGas,
			expiration: { None: true },
		});

		await bob.signIn();
		await bob.openProposalsTab();
		const expiry = bob
			.proposalRow(expiring.digest)
			.getByTestId('proposal-expiry');
		await expect(expiry).toHaveText(/^Expires in /);
		await expiry.hover();
		await expect(
			bob.page.getByRole('tooltip'),
		).toContainText('it has to be proposed again');
		const lastingCard = bob.proposalRow(lasting.digest);
		await expect(lastingCard).toBeVisible();
		await expect(
			lastingCard.getByTestId('proposal-expiry'),
		).toHaveCount(0);
	});

	test('a member cancels a pending proposal', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = createIdentity('alice');
		const bob = await createActor('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
		});
		await chain.fund(multisig.address);
		const proposal = await proposeTransfer(chain, alice, {
			multisigAddress: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
			description: 'Cancel me',
		});

		await bob.signIn();
		await bob.openProposalsTab();
		const card = bob.proposalRow(proposal.digest);
		await expect(card).toHaveAttribute(
			'data-status',
			'pending',
		);
		// Cancel is in the row's menu, which opens over the page.
		await card.getByTestId('proposal-actions').click();
		await bob.page
			.getByTestId('cancel-proposal-button')
			.click();
		await bob.page
			.getByTestId('confirm-cancel-proposal-button')
			.click();

		await expect(card).toHaveAttribute(
			'data-status',
			'cancelled',
		);
		await expect(
			card.getByTestId('execute-proposal-button'),
		).toHaveCount(0);
	});

	test('proposes a custom transaction from raw bytes', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
		});
		await chain.fund(multisig.address);
		const bytes = await chain.buildSuiTransfer({
			sender: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI / 4n,
		});

		await alice.signIn();
		await clickNewProposal(alice.page);
		await chooseType(alice.page, 'bytes');
		await pasteBytes(
			alice.page,
			bytes,
			'Pay a quarter SUI',
		);
		await reviewBytes(alice.page);
		await expectSimulation(alice.page, 'success');
		await proposeAndSign(alice.page);

		const card = alice.page.getByTestId('proposal-row');
		await expect(card).toHaveAttribute(
			'data-status',
			'pending',
		);
		const digest = await card.getAttribute('data-digest');

		// Bob signs from the API; Alice's view picks it up on refresh.
		const proposal = await bob.api.getProposalByDigest(
			digest!,
		);
		await signProposal(bob, proposal);
		await alice.page
			.getByTestId('refresh-proposals-button')
			.click();
		await expect(card).toHaveAttribute(
			'data-status',
			'ready',
		);
	});

	test('warns that a transaction would fail on-chain before proposing', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
		});
		await chain.fund(multisig.address);

		await alice.signIn();
		await clickNewProposal(alice.page);
		await chooseType(alice.page, 'bytes');
		await pasteBytes(
			alice.page,
			await chain.buildOverdrawnSuiTransfer({
				sender: multisig.address,
				recipient: randomAddress(),
			}),
			'Overdraw the account',
		);
		await reviewBytes(alice.page);

		await expect(
			alice.page.getByTestId('transaction-preview-result'),
		).toHaveAttribute('data-result', 'failure');
		await expect(
			alice.page.getByTestId('review-simulation-error'),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('review-submit'),
		).toHaveText('Propose and sign anyway');
	});
});
