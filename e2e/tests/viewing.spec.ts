// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MIST_PER_SUI } from '@mysten/sui/utils';

import { recordSignIns } from '../support/actor';
import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';
import { expectOnProposal } from '../support/new-proposal';
import {
	proposeTransfer,
	setupMultisig,
} from '../support/scenarios';

test.describe('shared proposal links', () => {
	test('a co-signer signs and executes from the link without signing in', async ({
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
			amount: 2n * MIST_PER_SUI,
			description: 'Shared by link',
		});

		// The link only needs a connected wallet, not an API session. Not
		// signed in, Bob reads it at the link, outside the account.
		const signIns = recordSignIns(bob.page);
		await bob.page.goto(
			`/proposals?digest=${proposal.digest}`,
		);
		await bob.connectWallet({ signIn: false });
		const page = bob.proposalPage(proposal.digest);
		await expect(page).toHaveAttribute(
			'data-status',
			'pending',
		);
		await expect(bob.page).toHaveURL(
			(url) => url.pathname === '/proposals',
		);

		// His signature reaches the threshold; sign alone, then execute.
		await page.getByTestId('execute-after-signing').click();
		const sign = page.getByTestId('sign-proposal-button');
		await expect(sign).toHaveText('Sign proposal');
		await sign.click();
		await expect(page).toHaveAttribute(
			'data-status',
			'ready',
		);
		await page
			.getByTestId('execute-proposal-button')
			.click();
		await expect
			.poll(() => page.getAttribute('data-status'))
			.toBe('executed');
		expect(await chain.balance(recipient)).toBe(
			2n * MIST_PER_SUI,
		);
		expect(signIns).toHaveLength(0);
		await expect(bob.walletMenuButton()).toHaveAttribute(
			'data-auth-state',
			'unauthenticated',
		);
	});

	test('a non-member can view the proposal but not sign it', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = createIdentity('alice');
		const bob = createIdentity('bob');
		const mallory = await createActor('mallory');
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

		// Signed out, anyone can read the link.
		await mallory.page.goto(
			`/proposals?digest=${proposal.digest}`,
		);
		const page = mallory.proposalPage(proposal.digest);
		const expectReadOnly = async () => {
			await expect(page).toHaveAttribute(
				'data-status',
				'pending',
			);
			await expect(
				page.getByTestId('preview-cannot-sign'),
			).toBeVisible();
			await expect(
				page.getByTestId('sign-proposal-button'),
			).toHaveCount(0);
		};
		await expectReadOnly();

		// A connected wallet that isn't a signer can't sign either.
		await mallory.connectWallet({ signIn: false });
		await expectReadOnly();
	});

	test('a signed-in member opening the link moves to the proposal under the account', async ({
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
		});

		await bob.signIn();
		await bob.page.goto(
			`/proposals?digest=${proposal.digest}`,
		);
		await expectOnProposal(
			bob.page,
			multisig.address,
			proposal.digest,
		);
		await expect(
			bob
				.proposalPage(proposal.digest)
				.getByTestId('sign-proposal-button'),
		).toBeVisible();
	});
});

test('the overview and balances match the multisig on-chain', async ({
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
		name: 'Ops',
	});
	await chain.fund(multisig.address);

	await alice.signIn();
	const { page } = alice;
	await expect(
		page.getByTestId('multisig-detail'),
	).toHaveAttribute(
		'data-multisig-address',
		multisig.address,
	);

	await page.getByTestId('multisig-tab-overview').click();
	await expect(
		page.getByTestId('page-header-address'),
	).toHaveText(multisig.address);
	await page.getByTestId('multisig-tab-signers').click();
	const threshold = page.getByTestId('setup-threshold');
	await expect(threshold).toHaveAttribute(
		'data-threshold',
		'1',
	);
	await expect(threshold).toHaveAttribute(
		'data-total-weight',
		'2',
	);
	for (const member of [alice, bob])
		await expect(
			alice.memberItem(member.address),
		).toHaveAttribute('data-status', 'accepted');

	await page.getByTestId('multisig-tab-assets').click();
	await expect(alice.suiBalanceRow()).toHaveAttribute(
		'data-balance',
		String(await chain.balance(multisig.address)),
	);
});
