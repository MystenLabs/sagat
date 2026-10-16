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

// The address depends on the order of the members, so reordering them makes
// a different multisig.
test('reordering the members changes the multisig', async ({
	createActor,
	createIdentity,
}) => {
	const alice = await createActor('alice');
	const bob = createIdentity('bob');
	const carol = createIdentity('carol');
	const inOrder = multisigAddressOf(
		[
			{ identity: alice },
			{ identity: bob },
			{ identity: carol },
		],
		2,
	);
	const reordered = multisigAddressOf(
		[
			{ identity: alice },
			{ identity: carol },
			{ identity: bob },
		],
		2,
	);
	expect(reordered).not.toBe(inOrder);

	await alice.signIn();
	const { page } = alice;
	await page.getByTestId('create-first-multisig').click();
	const members = page.getByTestId('member-row');
	for (const [index, member] of [bob, carol].entries()) {
		await page.getByTestId('add-member-button').click();
		await members
			.nth(index + 1)
			.getByTestId('member-public-key-input')
			.fill(member.publicKey);
	}
	await page.getByTestId('threshold-input').fill('2');
	const preview = page.getByTestId(
		'multisig-address-preview',
	);
	await expect(preview).toHaveText(inOrder);

	// Drag Bob's handle down past Carol's row, in steps so the list sees
	// the pointer move.
	const handle = members
		.nth(1)
		.getByTestId('member-drag-handle');
	const from = (await handle.boundingBox())!;
	const bobRow = (await members.nth(1).boundingBox())!;
	const carolRow = (await members.nth(2).boundingBox())!;
	const x = from.x + from.width / 2;
	const y = from.y + from.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(
		x,
		y + (carolRow.y - bobRow.y) + 10,
		{
			steps: 20,
		},
	);
	await page.mouse.up();
	await expect(
		members.nth(2).getByTestId('member-public-key-input'),
	).toHaveValue(bob.publicKey);
	await expect(preview).toHaveText(reordered);

	await page.getByTestId('create-multisig-submit').click();
	await expect(
		page.getByTestId('multisig-detail'),
	).toHaveAttribute('data-multisig-address', reordered);
});
