// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MIST_PER_SUI, toBase58 } from '@mysten/sui/utils';

import { content } from '../../app/src/content';
import { randomAddress } from '../support/chain';
import {
	expect,
	test,
	type Fixtures,
} from '../support/fixtures';
import {
	beforeSending,
	isCancelRequest,
	isVoteRequest,
	toast,
} from '../support/new-proposal';
import {
	addProposer,
	cancelProposal,
	executeOutsideApp,
	proposeFailedTransfer,
	proposeTransfer,
	setupMultisig,
	signProposal,
} from '../support/scenarios';

/**
 * Alice and Bob share a 1-of-2 account with Bob's proposal, ready to
 * execute but failing its simulation; Alice is signed in on its page.
 */
async function openFailingProposal({
	createActor,
	createIdentity,
	chain,
}: Fixtures) {
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
		signature: await bob.signTransaction(transactionBytes),
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
	return { alice, page };
}

/**
 * Alice proposes a transfer from their 2-of-2 account, and Bob opens it
 * signed in. With `ready`, Bob has signed it already, through the API.
 */
async function openProposalAsBob(
	{ createActor, createIdentity, chain }: Fixtures,
	{ ready = false }: { ready?: boolean } = {},
) {
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
	});
	if (ready) await signProposal(bob, proposal);
	await bob.signIn();
	await bob.page.goto(
		`/multisig/${multisig.address}/proposals/${proposal.digest}`,
	);
	const page = bob.proposalPage(proposal.digest);
	await expect(page).toHaveAttribute(
		'data-status',
		ready ? 'ready' : 'pending',
	);
	return { alice, bob, proposal, page };
}

test.describe('errors', () => {
	test('shows why a proposal failed to execute', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, page } = await openFailingProposal({
			createActor,
			createIdentity,
			chain,
		});

		// Execute simulates again; still failing, it asks first.
		await page
			.getByTestId('execute-proposal-button')
			.click();
		await alice.page
			.getByTestId('execute-anyway-dialog')
			.getByTestId('execute-anyway-button')
			.click();
		const toast = alice.page.locator(
			'[data-sonner-toast][data-type="error"]',
			{ hasText: 'Couldn’t execute the proposal' },
		);
		await expect(toast).toBeVisible();
		// A long description must not squeeze the title into a few letters per line.
		const title = await toast
			.locator('[data-title]')
			.boundingBox();
		expect(title?.width).toBeGreaterThan(160);
		// TODO: it can never execute now, so it should move to a new terminal
		// status (see lookupAndVerifyProposal in the API) instead of staying
		// ready.
		await expect(page).toHaveAttribute(
			'data-status',
			'ready',
		);
	});

	test("a re-simulation that can't run asks before executing", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, page } = await openFailingProposal({
			createActor,
			createIdentity,
			chain,
		});

		// Execute's second dry run can't reach the node.
		await alice.page.route(
			'**/SimulateTransaction',
			(route) =>
				route.request().method() === 'POST'
					? route.abort()
					: route.continue(),
		);
		await page
			.getByTestId('execute-proposal-button')
			.click();
		const dialog = alice.page.getByTestId(
			'execute-anyway-dialog',
		);
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText(
			'Simulation couldn’t run',
		);

		// Going back executes nothing, and the page still knows it fails:
		// Execute asks again.
		await dialog.getByTestId('execute-anyway-back').click();
		await expect(dialog).toBeHidden();
		await expect(
			page.getByTestId('execute-proposal-button'),
		).toHaveText('Execute');
		await expect(page).toHaveAttribute(
			'data-status',
			'ready',
		);
		await expect(
			page.getByTestId('proposal-simulation-failed'),
		).toBeVisible();
		await page
			.getByTestId('execute-proposal-button')
			.click();
		await expect(dialog).toBeVisible();
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

	test('a vote the API refuses shows an error and doesn’t count the signature', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, bob, proposal, page } =
			await openProposalAsBob({
				createActor,
				createIdentity,
				chain,
			});
		const sign = page.getByTestId('sign-proposal-button');
		await expect(sign).toBeEnabled();

		// Alice cancels it while Bob's vote is on its way.
		await beforeSending(bob.page, isVoteRequest, () =>
			cancelProposal(alice, proposal),
		);
		await sign.click();
		await expect(
			toast(bob.page, 'error').filter({
				hasText: content.toasts.proposalSignFailed,
			}),
		).toBeVisible();
		await expect(page).toHaveAttribute(
			'data-status',
			'cancelled',
		);
		await expect(
			bob.approvalRow(bob.address),
		).toHaveAttribute('data-signed', 'false');
		await expect(
			toast(bob.page, 'success').filter({
				hasText: content.toasts.signatureAdded,
			}),
		).toHaveCount(0);
	});

	test('a cancel the API refuses shows an error and doesn’t show the proposal cancelled', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, bob, proposal, page } =
			await openProposalAsBob(
				{ createActor, createIdentity, chain },
				{ ready: true },
			);

		// It executes on-chain while Bob's cancel is on its way.
		await beforeSending(
			bob.page,
			isCancelRequest,
			async () => {
				await executeOutsideApp(chain, {
					members: [{ identity: alice }, { identity: bob }],
					threshold: 2,
					signers: [alice, bob],
					transactionBytes: proposal.transactionBytes,
				});
				await alice.api.verifyProposalByDigest(
					proposal.digest,
				);
			},
		);
		await page
			.getByTestId('cancel-proposal-button')
			.click();
		await bob.page
			.getByTestId('confirm-cancel-proposal-button')
			.click();
		await expect(
			toast(bob.page, 'error').filter({
				hasText: content.toasts.proposalCancelFailed(''),
			}),
		).toBeVisible();
		await expect(page).not.toHaveAttribute(
			'data-status',
			'cancelled',
		);
		await expect(
			toast(bob.page, 'success').filter({
				hasText: content.toasts.proposalCancelled,
			}),
		).toHaveCount(0);
	});

	test('a proposal that executed and failed on-chain shows why', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 1,
		});
		await chain.fund(multisig.address);
		const proposal = await proposeFailedTransfer(chain, {
			members: [{ identity: alice }, { identity: bob }],
			threshold: 1,
			signers: [bob],
		});

		await alice.signIn();
		await alice.page.goto(
			`/multisig/${multisig.address}/proposals/${proposal.digest}`,
		);
		const page = alice.proposalPage(proposal.digest);
		await expect(page).toHaveAttribute(
			'data-status',
			'failed',
		);
		await expect(
			page.getByTestId('proposal-execution-failed'),
		).toContainText('InsufficientCoinBalance');
		await expect(
			page.getByTestId('sign-proposal-button'),
		).toHaveCount(0);
		await expect(
			page.getByTestId('execute-proposal-button'),
		).toHaveCount(0);
	});

	test('adding a proposer the API refuses shows why and leaves the list as it was', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const payments = createIdentity('payments');
		const multisig = await setupMultisig({
			creator: alice,
			members: [createIdentity('bob')],
			threshold: 1,
		});
		await addProposer(
			alice,
			multisig.address,
			payments.address,
		);

		await alice.signIn();
		const { page } = alice;
		await page.getByTestId('multisig-tab-signers').click();
		const card = page.getByTestId('proposers-card');
		const items = card.getByTestId('proposer-item');
		await expect(items).toHaveCount(1);

		// Already a proposer, so the API refuses to add it again.
		await card.getByTestId('add-proposer-button').click();
		const dialog = page.getByTestId('add-proposer-dialog');
		await dialog
			.getByLabel(content.common.fields.address, {
				exact: true,
			})
			.fill(payments.address);
		await dialog
			.getByRole('button', {
				name: content.proposers.addDialog.submit,
				exact: true,
			})
			.click();
		await expect(
			toast(page, 'error').filter({
				hasText: 'already a proposer',
			}),
		).toBeVisible();
		await expect(items).toHaveCount(1);
		await expect(items).toHaveAttribute(
			'data-address',
			payments.address,
		);
	});
});
