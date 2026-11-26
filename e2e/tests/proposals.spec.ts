// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MIST_PER_SUI } from '@mysten/sui/utils';

import { content } from '../../app/src/content';
import {
	randomAddress,
	reportEpoch,
} from '../support/chain';
import {
	expect,
	test,
	type Fixtures,
} from '../support/fixtures';
import {
	chooseType,
	clickNewProposal,
	expectSimulation,
	fillTransfer,
	pasteBytes,
	proposeAndSign,
	recordVotes,
	reviewBytes,
	reviewTransfer,
	toast,
} from '../support/new-proposal';
import {
	addPodAsAlias,
	bothSign,
	cancelProposal,
	enableAliases,
	proposeThresholdChange,
	proposeTransfer,
	removeAlias,
	setupMultisig,
	setupProposal,
	signProposal,
} from '../support/scenarios';

/** A transfer ready only through Carol and Dave's added set, open on Carol's page. */
async function readyThroughAddedSet({
	createActor,
	createIdentity,
	chain,
}: Fixtures) {
	const alice = createIdentity('alice');
	const bob = createIdentity('bob');
	const carol = await createActor('carol');
	const dave = createIdentity('dave');
	const multisig = await setupMultisig({
		creator: alice,
		members: [bob],
		threshold: 2,
	});
	await chain.fund(multisig.address);
	// Before the pod's first /v1 read, so the API sees it at once.
	const recovery = await addPodAsAlias(
		chain,
		bothSign(alice, bob),
		{
			creator: carol,
			member: dave,
			accepting: [carol, dave],
		},
	);
	const recipient = randomAddress();
	const proposal = await proposeTransfer(chain, dave, {
		multisigAddress: multisig.address,
		recipient,
		amount: MIST_PER_SUI,
	});
	await signProposal(carol, proposal);

	await carol.signIn();
	await carol.page.goto(
		`/multisig/${multisig.address}/proposals/${proposal.digest}`,
	);
	const page = carol.proposalPage(proposal.digest);
	await expect(page).toHaveAttribute(
		'data-status',
		'ready',
	);
	return {
		alice,
		bob,
		carol,
		multisig,
		recovery,
		proposal,
		recipient,
		page,
	};
}

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
		const bobRow = alice.approvalRow(bob.address);
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

	test('a key in two signer sets counts in both, and the proposal is ready once either set reaches its threshold', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = createIdentity('alice');
		const bob = createIdentity('bob');
		const carol = await createActor('carol');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
		});
		await chain.fund(multisig.address);
		// Alice is in both sets.
		const recovery = await addPodAsAlias(
			chain,
			bothSign(alice, bob),
			{ creator: alice, member: carol, accepting: [carol] },
		);
		const proposal = await proposeTransfer(chain, alice, {
			multisigAddress: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
		});

		await carol.signIn();
		await carol.page.goto(
			`/multisig/${multisig.address}/proposals/${proposal.digest}`,
		);
		const page = carol.proposalPage(proposal.digest);
		const STATUS = content.proposal.approvals.status;
		const set = (address: string) =>
			page.locator(
				`[data-testid="approvals-signer-set"][data-address="${address}"]`,
			);
		const status = page.getByTestId('approvals-status');
		const toggle = page.getByTestId(
			'approvals-other-signer-sets-toggle',
		);
		const foldedLine = page.getByTestId(
			'approvals-other-signer-sets-line',
		);
		// Carol's set stays open; the pod's own set is folded under it.
		await expect(set(recovery.address)).toBeVisible();
		await expect(toggle).toHaveText(
			content.common.moreSignerSets(1),
		);
		await expect(set(multisig.address)).toHaveCount(0);
		// The folded set is no closer to its threshold.
		await expect(foldedLine).toHaveCount(0);
		await toggle.click();
		await expect(
			page.getByTestId('approvals-signer-set'),
		).toHaveCount(2);
		for (const address of [
			multisig.address,
			recovery.address,
		]) {
			await expect(set(address)).toHaveAttribute(
				'data-current-weight',
				'1',
			);
		}
		await expect(set(multisig.address)).toContainText(
			STATUS.needs(1),
		);
		await expect(page).toHaveAttribute(
			'data-status',
			'pending',
		);
		// The open set's line is the card's while pending.
		await expect(status).toHaveText(STATUS.needs(1));

		await page.getByTestId('execute-after-signing').click();
		await page.getByTestId('sign-proposal-button').click();
		await expect(page).toHaveAttribute(
			'data-status',
			'ready',
		);
		await expect(set(recovery.address)).toHaveAttribute(
			'data-current-weight',
			'2',
		);
		await expect(set(multisig.address)).toHaveAttribute(
			'data-current-weight',
			'1',
		);
		await expect(status).toHaveText(STATUS.ready);

		// Once the folded set reaches its threshold too, the closed row says so.
		await toggle.click();
		await expect(foldedLine).toHaveCount(0);
		await signProposal(bob, proposal);
		await expect(foldedLine).toHaveText(STATUS.reached, {
			timeout: 20_000,
		});
		await expect(
			page.getByTestId('execute-proposal-button'),
		).toBeVisible();
	});

	test('a second signer set signs a proposal to its threshold and executes it', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { carol, recovery, proposal, recipient, page } =
			await readyThroughAddedSet({
				createActor,
				createIdentity,
				chain,
			});

		await page
			.getByTestId('execute-proposal-button')
			.click();
		await expect(page).toHaveAttribute(
			'data-status',
			'executed',
		);
		expect(await chain.balance(recipient)).toBe(
			MIST_PER_SUI,
		);
		const executed = await carol.apiV1.getProposalByDigest(
			proposal.digest,
		);
		expect(executed.executedVia).toBe(recovery.address);
	});

	test('a signer change ready at the old threshold warns, offers no Execute in its list row, and executes', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const carol = createIdentity('carol');
		const members = [alice, bob, carol];
		// A pod of its own: executing changes its signers.
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob, carol],
			threshold: 2,
			labels: ['Alice', 'Bob', 'Carol'],
		});
		await chain.fund(multisig.address);
		await enableAliases(chain, {
			members: members.map((identity) => ({ identity })),
			threshold: 2,
			signers: [alice, bob],
		});
		// 2-of-3 to 3-of-3, signed by Alice and Bob: ready, with Carol missing for the new threshold.
		const proposal = await proposeThresholdChange(
			chain,
			alice,
			{ members, threshold: 2, newThreshold: 3 },
		);
		await signProposal(bob, proposal);

		await alice.signIn();
		// Its list row offers no Execute: that happens on the page, under the warning.
		await alice.page.goto(
			`/multisig/${multisig.address}/proposals`,
		);
		await alice.page
			.getByTestId('proposal-filter-ready')
			.click();
		const row = alice.proposalRow(proposal.digest);
		await expect(row).toHaveAttribute(
			'data-status',
			'ready',
		);
		await expect(
			row.getByTestId('execute-proposal-button'),
		).toHaveCount(0);

		await alice.page.goto(
			`/multisig/${multisig.address}/proposals/${proposal.digest}`,
		);
		const page = alice.proposalPage(proposal.digest);
		await expect(page).toHaveAttribute(
			'data-status',
			'ready',
		);
		await expect(
			alice.page.getByTestId('signer-change-warning'),
		).toBeVisible();
		// Held until Carol signs for the new threshold.
		await expect(
			page.getByTestId('execute-proposal-button'),
		).toHaveCount(0);
		await signProposal(carol, proposal);
		await alice.page.reload();
		await expect(
			alice.page.getByTestId('signer-change-warning'),
		).toHaveCount(0);

		await page
			.getByTestId('execute-proposal-button')
			.click();
		await expect(page).toHaveAttribute(
			'data-status',
			'executed',
		);
	});

	test('an execution the node refuses once the signer set left the pod reads the signers again', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, bob, carol, recovery, recipient, page } =
			await readyThroughAddedSet({
				createActor,
				createIdentity,
				chain,
			});
		await removeAlias(
			chain,
			bothSign(alice, bob),
			recovery.address,
		);

		await page
			.getByTestId('execute-proposal-button')
			.click();
		await expect(
			toast(carol.page, 'error').filter({
				hasText: content.toasts.proposalExecuteFailed,
			}),
		).toContainText(
			content.toasts.proposalSignersChanged('Localnet'),
		);
		expect(await chain.balance(recipient)).toBe(0n);
		// Read again from the node, Carol's set no longer counts: only the pod's own set shows.
		await expect(page).toHaveAttribute(
			'data-status',
			'pending',
		);
		await expect(
			carol.approvalRow(carol.address),
		).toHaveCount(0);
		await expect(
			carol.approvalRow(alice.address),
		).toHaveAttribute('data-signed', 'false');
		await expect(
			page.getByTestId('execute-proposal-button'),
		).toHaveCount(0);
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
			lastingCard.getByTestId('proposal-date'),
		).toBeVisible();
		await expect(
			lastingCard.getByTestId('proposal-expiry'),
		).toHaveCount(0);
	});

	test('an expired proposal can’t be signed', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const epoch = await chain.epoch();
		const { bob, multisig, proposal } = await setupProposal(
			{ createActor, createIdentity, chain },
			{ expiration: { Epoch: epoch } },
		);

		// Valid only in this epoch, and Bob's page is told the next one began.
		await reportEpoch(bob.page, epoch + 1);
		await bob.signIn();
		await bob.page.goto(
			`/multisig/${multisig.address}/proposals/${proposal.digest}`,
		);
		const page = bob.proposalPage(proposal.digest);
		await expect(page).toHaveAttribute(
			'data-status',
			'expired',
		);
		await expect(
			page.getByTestId('cancel-proposal-button'),
		).toBeVisible();
		await expect(
			page.getByTestId('sign-proposal-button'),
		).toHaveCount(0);
	});

	test('a signature declined in the wallet sends no vote and can be retried', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		// Bob's signature alone doesn't reach the threshold.
		const { bob, multisig, proposal } = await setupProposal(
			{ createActor, createIdentity, chain },
			{
				others: [createIdentity('carol')],
				threshold: 3,
				bob: { rejectSigning: true },
			},
		);

		await bob.signIn();
		await bob.page.goto(
			`/multisig/${multisig.address}/proposals/${proposal.digest}`,
		);
		const page = bob.proposalPage(proposal.digest);
		const sign = page.getByTestId('sign-proposal-button');
		const bobRow = bob.approvalRow(bob.address);
		const votes = recordVotes(bob.page);
		await sign.click();
		await expect(
			toast(bob.page, 'error').filter({
				hasText: content.toasts.proposalSignFailed,
			}),
		).toBeVisible();
		expect(votes).toEqual([]);
		await expect(page).toHaveAttribute(
			'data-status',
			'pending',
		);
		await expect(bobRow).toHaveAttribute(
			'data-signed',
			'false',
		);

		await bob.page.evaluate(() => {
			window.__e2eWallet!.rejectSigning = false;
		});
		await sign.click();
		await expect(bobRow).toHaveAttribute(
			'data-signed',
			'true',
		);
		expect(votes).toHaveLength(1);
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

		// Nothing is open now, but the account has had a proposal.
		await bob.page.goto(`/multisig/${multisig.address}`);
		await expect(
			bob.page.getByTestId('open-proposals-empty'),
		).toHaveText(content.overview.openProposals.noneOpen);
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
		// The proposer signed by proposing; the warning stays while it can still run.
		await expect(
			page.getByTestId('signing-notice'),
		).toBeVisible();
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
		await expect(
			page.getByTestId('signing-notice'),
		).toHaveCount(0);

		// Nothing left to export, on the page or in its row; the link stays.
		await expect(
			page.getByTestId('export-proposal-button'),
		).toHaveCount(0);
		await expect(
			page.getByTestId('copy-proposal-link'),
		).toBeVisible();
		await alice.page.goto(
			`/multisig/${multisig.address}/proposals`,
		);
		await alice.page
			.getByTestId('proposal-filter-cancelled')
			.click();
		await alice
			.proposalRow(proposal.digest)
			.getByTestId('proposal-actions')
			.click();
		await expect(
			alice.page.getByTestId('copy-proposal-link'),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('export-proposal-button'),
		).toHaveCount(0);
	});

	test('a cancelled proposal whose transaction expired isn’t simulated', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const epoch = await chain.epoch();
		const { alice, bob, multisig, proposal } =
			await setupProposal(
				{ createActor, createIdentity, chain },
				{ expiration: { Epoch: epoch } },
			);
		await cancelProposal(alice, proposal);

		await reportEpoch(bob.page, epoch + 1);
		await bob.signIn();
		await bob.page.goto(
			`/multisig/${multisig.address}/proposals/${proposal.digest}`,
		);
		const page = bob.proposalPage(proposal.digest);
		await expect(page).toHaveAttribute(
			'data-status',
			'cancelled',
		);
		await expect(
			page.getByTestId('transaction-preview-status'),
		).toHaveAttribute('data-status', 'expired');
		await expect(
			page.getByTestId('transaction-preview-panel'),
		).toHaveText(content.transactionPreview.expired);
	});

	test('a click anywhere on a row opens the proposal’s page', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { bob, proposal } = await setupProposal({
			createActor,
			createIdentity,
			chain,
		});

		await bob.signIn();
		await bob.openProposalsTab();
		await bob
			.proposalRow(proposal.digest)
			.getByTestId('proposal-status')
			.click();
		await expect(
			bob.proposalPage(proposal.digest),
		).toBeVisible();
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
			await bob.apiV1.getProposalByDigest(digest);
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
