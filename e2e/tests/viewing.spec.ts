// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MIST_PER_SUI } from '@mysten/sui/utils';

import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';
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

		// The link only needs a connected wallet, not an API session.
		await bob.page.goto(
			`/proposals?digest=${proposal.digest}`,
		);
		await bob.connectWallet();
		const card = bob.proposalCard(proposal.digest);
		await expect(card).toHaveAttribute(
			'data-status',
			'pending',
		);

		await card.getByTestId('sign-proposal-button').click();
		await expect(card).toHaveAttribute(
			'data-status',
			'ready',
		);
		await card
			.getByTestId('execute-proposal-button')
			.click();
		await expect(card).toHaveAttribute(
			'data-status',
			'executed',
		);
		expect(await chain.balance(recipient)).toBe(
			2n * MIST_PER_SUI,
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

		await mallory.page.goto(
			`/proposals?digest=${proposal.digest}`,
		);
		await mallory.connectWallet();
		const card = mallory.proposalCard(proposal.digest);
		await expect(card).toHaveAttribute(
			'data-status',
			'pending',
		);
		await expect(
			card.getByTestId('preview-cannot-sign'),
		).toBeVisible();
		await expect(
			card.getByTestId('sign-proposal-button'),
		).toHaveCount(0);
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
		page.getByTestId('multisig-address'),
	).toHaveText(multisig.address);
	const threshold = page.getByTestId('multisig-threshold');
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
