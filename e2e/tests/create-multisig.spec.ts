// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '../support/fixtures';
import { multisigAddressOf } from '../support/scenarios';

test('creates a weighted multisig and invites the other members', async ({
	createActor,
	createIdentity,
}) => {
	const alice = await createActor('alice');
	const bob = createIdentity('bob');
	const carol = createIdentity('carol');
	const expectedAddress = multisigAddressOf(
		[
			{ identity: alice },
			{ identity: bob },
			{ identity: carol, weight: 2 },
		],
		3,
	);

	await alice.signIn();
	const { page } = alice;
	await page.getByTestId('create-first-multisig').click();

	await page
		.getByTestId('multisig-name-input')
		.fill('E2E Treasury');
	const members = page.getByTestId('member-row');
	// The creator is filled in from the signed-in account.
	await expect(
		members.nth(0).getByTestId('member-public-key-input'),
	).toHaveValue(alice.publicKey);
	await page.getByTestId('add-member-button').click();
	await members
		.nth(1)
		.getByTestId('member-public-key-input')
		.fill(bob.publicKey);
	await page.getByTestId('add-member-button').click();
	await members
		.nth(2)
		.getByTestId('member-public-key-input')
		.fill(carol.publicKey);
	await members
		.nth(2)
		.getByTestId('member-weight-input')
		.fill('2');
	await page.getByTestId('threshold-input').fill('3');

	// The live preview must match the address the chain will use.
	await expect(
		page.getByTestId('multisig-address-preview'),
	).toHaveText(expectedAddress);

	await page.getByTestId('create-multisig-submit').click();

	// The creator lands on the new multisig; the others still have to accept.
	await expect(
		page.getByTestId('multisig-detail'),
	).toHaveAttribute(
		'data-multisig-address',
		expectedAddress,
	);
	await page.getByTestId('multisig-tab-overview').click();
	const threshold = page.getByTestId('multisig-threshold');
	await expect(threshold).toHaveAttribute(
		'data-threshold',
		'3',
	);
	await expect(threshold).toHaveAttribute(
		'data-total-weight',
		'4',
	);
	await expect(
		alice.memberItem(alice.address),
	).toHaveAttribute('data-status', 'accepted');
	await expect(
		alice.memberItem(bob.address),
	).toHaveAttribute('data-status', 'pending');
	await expect(
		alice.memberItem(carol.address),
	).toHaveAttribute('data-status', 'pending');
});
