// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { toBase64 } from '@mysten/sui/utils';

import { expect, test } from '../support/fixtures';

// The Signature Analyzer tool at /tools/signature-analyzer decodes a
// serialized signature. It runs in the browser only, so the bytes signed
// here needn't be a real transaction.
const BYTES = toBase64(
	new TextEncoder().encode('not a transaction'),
);

test.describe('signature analyzer tool', () => {
	test('decodes a single signature', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');

		await alice.page.goto('/tools/signature-analyzer');
		await alice.page
			.getByTestId('signature-input')
			.fill(await alice.signTransaction(BYTES));

		const card = alice.page.getByTestId('signature-card');
		await expect(card).toHaveCount(1);
		await expect(card).toHaveAttribute(
			'data-address',
			alice.address,
		);
		await expect(card).toHaveAttribute(
			'data-scheme',
			'ED25519',
		);
		await expect(
			alice.page.getByTestId('multisig-details'),
		).toHaveCount(0);
	});

	test('decodes a multisig signature into its members and signers', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const carol = createIdentity('carol');
		const multisigKey = MultiSigPublicKey.fromPublicKeys({
			threshold: 3,
			publicKeys: [
				{
					publicKey: alice.keypair.getPublicKey(),
					weight: 2,
				},
				{
					publicKey: bob.keypair.getPublicKey(),
					weight: 1,
				},
				{
					publicKey: carol.keypair.getPublicKey(),
					weight: 1,
				},
			],
		});
		// Alice and Bob sign; Carol doesn't.
		const combined = multisigKey.combinePartialSignatures([
			await alice.signTransaction(BYTES),
			await bob.signTransaction(BYTES),
		]);

		await alice.page.goto('/tools/signature-analyzer');
		await alice.page
			.getByTestId('signature-input')
			.fill(combined);

		const details = alice.page.getByTestId(
			'multisig-details',
		);
		await expect(details).toHaveAttribute(
			'data-address',
			multisigKey.toSuiAddress(),
		);
		await expect(details).toHaveAttribute(
			'data-threshold',
			'3',
		);
		await expect(
			details.getByTestId('multisig-participant'),
		).toHaveCount(3);
		for (const [member, weight, signed] of [
			[alice, '2', 'true'],
			[bob, '1', 'true'],
			[carol, '1', 'false'],
		] as const) {
			const participant = details.locator(
				`[data-testid="multisig-participant"][data-address="${member.address}"]`,
			);
			await expect(participant).toHaveAttribute(
				'data-weight',
				weight,
			);
			await expect(participant).toHaveAttribute(
				'data-signed',
				signed,
			);
		}

		const cards = alice.page.getByTestId('signature-card');
		await expect(cards).toHaveCount(2);
		await expect(cards.nth(0)).toHaveAttribute(
			'data-address',
			alice.address,
		);
		await expect(cards.nth(1)).toHaveAttribute(
			'data-address',
			bob.address,
		);
	});

	test('shows an error for input that is not a signature', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');

		await alice.page.goto('/tools/signature-analyzer');
		await alice.page
			.getByTestId('signature-input')
			.fill('not a signature');

		await expect(
			alice.page.getByTestId('signature-error'),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('signature-card'),
		).toHaveCount(0);
	});

	// The tools have no tab strip; the sidebar's Developer group links them.
	test('opens the tools from the sidebar', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');
		const { page } = alice;

		await page.goto('/tools');
		await expect(
			page.getByTestId('tools-page'),
		).toBeVisible();
		await expect(page).toHaveURL(
			/\/tools\/signature-analyzer$/,
		);
		await expect(
			page.getByRole('heading', { level: 1 }),
		).toHaveText('Signature Analyzer');

		await page
			.locator('[data-slot="sidebar"]')
			.getByRole('link', { name: 'Broadcasts' })
			.click();
		await expect(page).toHaveURL(/\/tools\/broadcast$/);
		await expect(
			page.getByRole('heading', { level: 1 }),
		).toHaveText('Broadcasts');
	});
});
