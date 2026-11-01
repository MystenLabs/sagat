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
			.getByTestId('token-send-button')
			.click();
		await fillTransfer(alice.page, {
			amount: '1.5',
			recipient,
			title: 'Pay 1.5 SUI',
		});
		await reviewTransfer(alice.page);
		await expectSimulation(alice.page, 'success');
		const digest = await proposeAndSign(alice.page);

		// Alice lands on the proposal's page. Proposing counts as her
		// signature.
		const alicePage = alice.proposalPage(digest);
		await expect(alicePage).toHaveAttribute(
			'data-status',
			'pending',
		);
		await expect(
			alicePage.getByTestId('proposal-already-signed'),
		).toBeVisible();

		// Bob opens it from the list and co-signs, which makes it
		// executable, then executes it.
		await bob.signIn();
		await bob.openProposalsTab();
		await bob
			.proposalRow(digest)
			.getByTestId('proposal-title')
			.click();
		const bobPage = bob.proposalPage(digest);
		// His signature reaches the threshold; sign alone, then execute.
		await bobPage
			.getByTestId('execute-after-signing')
			.click();
		await bobPage
			.getByTestId('sign-proposal-button')
			.click();
		await expect(bobPage).toHaveAttribute(
			'data-status',
			'ready',
		);
		await bobPage
			.getByTestId('execute-proposal-button')
			.click();
		// The success toast names the transaction. Suiscan doesn't index
		// localnet, so there is no explorer link here.
		const toast = bob.page.locator(
			'[data-sonner-toast][data-type="success"]',
			{ hasText: 'Proposal executed' },
		);
		await expect(toast).toContainText(digest);
		await expect(
			toast.getByRole('button', { name: /explorer/i }),
		).toHaveCount(0);
		await expect(bobPage).toHaveAttribute(
			'data-status',
			'executed',
		);

		// The transfer really happened on-chain.
		expect(await chain.balance(recipient)).toBe(
			(3n * MIST_PER_SUI) / 2n,
		);

		// Alice sees the outcome too: the transaction card with its digest
		// in place of the preview. Suiscan doesn't index localnet, so the
		// card has no explorer button.
		await alice.page.reload();
		await expect(alicePage).toHaveAttribute(
			'data-status',
			'executed',
		);
		const onChain = alicePage.getByTestId(
			'proposal-on-chain',
		);
		await expect(onChain).toHaveAttribute(
			'data-status',
			'executed',
		);
		await expect(
			onChain.getByTestId('proposal-on-chain-digest'),
		).toHaveText(digest);
		await expect(
			onChain.getByTestId('view-on-explorer'),
		).toHaveCount(0);
	});

	test('the page shows a co-signer’s signature without a reload', async ({
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
		const proposal = await proposeTransfer(chain, alice, {
			multisigAddress: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
		});

		await alice.signIn();
		await alice.page.goto(
			`/multisig/${multisig.address}/proposals/${proposal.digest}`,
		);
		const bobRow = alice
			.proposalPage(proposal.digest)
			.locator(
				`[data-testid="approval-row"][data-address="${bob.address}"]`,
			);
		await expect(bobRow).toHaveAttribute(
			'data-signed',
			'false',
		);

		// Bob signs from the API while Alice keeps the page open.
		await signProposal(bob, proposal);
		await expect(bobRow).toHaveAttribute(
			'data-signed',
			'true',
			{ timeout: 20_000 },
		);
	});

	test('a signature that reaches the threshold signs and executes in one click', async ({
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
		const recipient = randomAddress();
		const proposal = await proposeTransfer(chain, alice, {
			multisigAddress: multisig.address,
			recipient,
			amount: MIST_PER_SUI,
		});

		await bob.signIn();
		await bob.openProposalsTab();
		await bob
			.proposalRow(proposal.digest)
			.getByTestId('proposal-title')
			.click();
		const page = bob.proposalPage(proposal.digest);
		const executeAfter = page.getByTestId(
			'execute-after-signing',
		);
		const sign = page.getByTestId('sign-proposal-button');
		await expect(executeAfter).toBeChecked();
		await expect(sign).toHaveText('Sign and execute');
		await executeAfter.click();
		await expect(sign).toHaveText('Sign proposal');
		await executeAfter.click();

		await sign.click();
		await expect
			.poll(() => page.getAttribute('data-status'))
			.toBe('executed');
		expect(await chain.balance(recipient)).toBe(
			MIST_PER_SUI,
		);
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
		await bob
			.proposalRow(proposal.digest)
			.getByTestId('proposal-title')
			.click();
		const page = bob.proposalPage(proposal.digest);
		await expect(page).toHaveAttribute(
			'data-status',
			'pending',
		);
		// Alice, the proposer, signed, so it ends for her too.
		await page
			.getByTestId('cancel-proposal-button')
			.click();
		await expect(
			bob.page.getByTestId('cancel-proposal-dialog'),
		).toHaveAttribute('data-variant', 'others');
		await bob.page
			.getByTestId('confirm-cancel-proposal-button')
			.click();

		await expect(page).toHaveAttribute(
			'data-status',
			'cancelled',
		);
		await expect(
			page.getByTestId('execute-proposal-button'),
		).toHaveCount(0);
	});

	test('the proposer cancels their own proposal nobody else signed', async ({
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
		const proposal = await proposeTransfer(chain, alice, {
			multisigAddress: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
		});

		await alice.signIn();
		await alice.page.goto(
			`/multisig/${multisig.address}/proposals/${proposal.digest}`,
		);
		const page = alice.proposalPage(proposal.digest);
		await page
			.getByTestId('cancel-proposal-button')
			.click();
		await expect(
			alice.page.getByTestId('cancel-proposal-dialog'),
		).toHaveAttribute('data-variant', 'alone');
		await alice.page
			.getByTestId('confirm-cancel-proposal-button')
			.click();
		await expect(page).toHaveAttribute(
			'data-status',
			'cancelled',
		);
	});

	test('a stacked row opens the proposal’s page on a phone', async ({
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
		const title =
			'Fund the payroll account for October and the contractor retainers';
		const proposal = await proposeTransfer(chain, alice, {
			multisigAddress: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
			description: title,
		});

		await bob.signIn();
		await bob.openProposalsTab();
		await bob.page.setViewportSize({
			width: 375,
			height: 812,
		});
		const card = bob.proposalRow(proposal.digest);
		await expect(card).toHaveAttribute(
			'data-status',
			'pending',
		);

		// Stacked, the row keeps its whole title, and shows the weight and the
		// proposer the table hid.
		await expect(
			card.getByTestId('proposal-title'),
		).toHaveText(title);
		await expect(
			card.getByTestId('proposal-weight'),
		).toBeVisible();
		await expect(
			card.getByText(/^Proposed by/),
		).toBeVisible();

		// The row's menu opens over the page and closes on Escape. Nothing
		// is on chain yet, so there is nothing to view on the explorer.
		await card.getByTestId('proposal-actions').click();
		const copyLink = bob.page.getByTestId(
			'copy-proposal-link',
		);
		await expect(copyLink).toBeVisible();
		await expect(
			bob.page.getByTestId('view-on-explorer'),
		).toBeDisabled();
		await bob.page.keyboard.press('Escape');
		await expect(copyLink).toBeHidden();

		// The title opens the proposal's page, where Sign and Cancel live.
		await card.getByTestId('proposal-title').click();
		const page = bob.proposalPage(proposal.digest);
		await expect(page).toHaveAttribute(
			'data-status',
			'pending',
		);
		await expect(
			page.getByTestId('sign-proposal-button'),
		).toBeVisible();
		await expect(
			page.getByTestId('cancel-proposal-button'),
		).toBeVisible();
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
		const digest = await proposeAndSign(alice.page);

		const page = alice.proposalPage(digest);
		await expect(page).toHaveAttribute(
			'data-status',
			'pending',
		);

		// Bob signs from the API; Alice's view picks it up on reload.
		const proposal =
			await bob.api.getProposalByDigest(digest);
		await signProposal(bob, proposal);
		await alice.page.reload();
		await expect(page).toHaveAttribute(
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
			alice.page.getByTestId('transaction-preview-status'),
		).toHaveAttribute('data-status', 'failed');
		await expect(
			alice.page.getByTestId('transaction-preview-error'),
		).toContainText('InsufficientCoinBalance');
		await expect(
			alice.page.getByTestId('review-submit'),
		).toHaveText('Propose and sign anyway');
	});
});
