// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';

import {
	addSigners,
	setThreshold,
	signerRows,
} from '../support/create-wizard';
import { expect, test } from '../support/fixtures';
import {
	multisigAddressOf,
	signInViaApi,
} from '../support/scenarios';

test('creates a labelled multisig through the three steps', async ({
	createActor,
	createIdentity,
}) => {
	const alice = await createActor('alice');
	const bob = createIdentity('bob');
	const carol = createIdentity('carol');
	const expectedAddress = multisigAddressOf(
		[
			{ identity: alice },
			{ identity: bob, weight: 2 },
			{ identity: carol },
		],
		3,
	);

	await alice.signIn();
	const { page } = alice;
	await page.getByTestId('create-first-multisig').click();
	const continueButton = page.getByTestId(
		'create-continue',
	);

	await test.step('name', async () => {
		await expect(continueButton).toBeDisabled();
		await page
			.getByTestId('create-name-input')
			.fill('E2E Treasury');
		await continueButton.click();
	});

	await test.step('signers and threshold', async () => {
		// The creator comes from the connected wallet and can't be removed.
		const creator = signerRows(page).first();
		await expect(
			creator.getByTestId('create-signer-key'),
		).toHaveValue(alice.publicKey);
		await expect(
			creator.getByTestId('create-signer-label'),
		).toHaveValue('alice (you)');
		await expect(
			creator.getByTestId('create-signer-remove'),
		).toHaveCount(0);

		// Carol is left unnamed: a label is optional.
		await addSigners(page, [
			{ label: 'Bob', key: bob.publicKey, weight: 2 },
			{ key: carol.publicKey },
		]);

		// Bob alone meeting the threshold is a warning, not a block.
		await setThreshold(page, 2);
		await expect(
			page.getByTestId('create-threshold-warning'),
		).toHaveText(
			'Bob can approve proposals alone. Bob’s weight (2) is at or above the threshold (2). Lower Bob’s weight below 2, or raise the threshold above 2.',
		);
		await expect(continueButton).toBeEnabled();

		await setThreshold(page, 3);
		await expect(
			page.getByTestId('create-threshold-warning'),
		).toHaveCount(0);
		// The live preview must match the address the chain will use.
		await expect(
			page.getByTestId('create-preview-address'),
		).toHaveText(expectedAddress);
		await continueButton.click();
	});

	await test.step('review and create', async () => {
		await expect(
			page.getByTestId('create-review-address'),
		).toHaveText(expectedAddress);
		await expect(
			page.getByTestId('create-review-signer-name'),
		).toHaveText(['alice (you)', 'Bob', 'Signer 3']);
		await page.getByTestId('create-submit').click();
	});

	// The creator lands on the new multisig, greeted once with who was
	// invited; an unnamed signer goes by their short address.
	await expect(
		page.getByTestId('multisig-detail'),
	).toHaveAttribute(
		'data-multisig-address',
		expectedAddress,
	);
	await expect(
		page.getByTestId('created-banner'),
	).toHaveText(
		`Multisig created. Invitations sent to Bob and ${formatAddress(carol.address)}.`,
	);

	// The API saved the labels, aligned with the keys.
	await signInViaApi(alice);
	const saved =
		await alice.api.getMultisig(expectedAddress);
	expect(saved.name).toBe('E2E Treasury');
	expect(saved.threshold).toBe(3);
	expect(
		saved.members.map(({ publicKey, weight, label }) => ({
			publicKey,
			weight,
			label,
		})),
	).toEqual([
		// The creator's key is named after their wallet account.
		{
			publicKey: alice.publicKey,
			weight: 1,
			label: 'alice',
		},
		{ publicKey: bob.publicKey, weight: 2, label: 'Bob' },
		{ publicKey: carol.publicKey, weight: 1, label: null },
	]);

	await page.reload();
	await expect(
		page.getByTestId('multisig-detail'),
	).toBeVisible();
	await expect(
		page.getByTestId('created-banner'),
	).toBeHidden();
});

// The address depends on the order of the signers, so reordering them makes
// a different multisig.
test('reordering the signers changes the multisig', async ({
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
	await page.goto('/create');
	await page.getByTestId('create-name-input').fill('Order');
	await page.getByTestId('create-continue').click();
	await addSigners(page, [
		{ key: bob.publicKey },
		{ key: carol.publicKey },
	]);
	await setThreshold(page, 2);
	const preview = page.getByTestId(
		'create-preview-address',
	);
	await expect(preview).toHaveText(inOrder);

	// Drag Bob's handle down past Carol's row, in steps so the list sees
	// the pointer move.
	const rows = signerRows(page);
	const handle = rows
		.nth(1)
		.getByTestId('create-signer-drag');
	const from = (await handle.boundingBox())!;
	const bobRow = (await rows.nth(1).boundingBox())!;
	const carolRow = (await rows.nth(2).boundingBox())!;
	const x = from.x + from.width / 2;
	const y = from.y + from.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(
		x,
		y + (carolRow.y - bobRow.y) + 10,
		{ steps: 20 },
	);
	await page.mouse.up();
	await expect(
		rows.nth(2).getByTestId('create-signer-key'),
	).toHaveValue(bob.publicKey);
	await expect(preview).toHaveText(reordered);

	// The list swallows clicks for 50ms after a drop, so retry until
	// Continue takes.
	await expect(async () => {
		await page.getByTestId('create-continue').click();
		await expect(
			page.getByTestId('create-review-step'),
		).toBeVisible({ timeout: 1_000 });
	}).toPass();
	await page.getByTestId('create-submit').click();
	await expect(
		page.getByTestId('multisig-detail'),
	).toHaveAttribute('data-multisig-address', reordered);
});
