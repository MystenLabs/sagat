// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomAddress } from '../support/chain';
import {
	addSigners,
	nameMultisig,
	reviewMultisig,
	setThreshold,
	signerRows,
} from '../support/create-wizard';
import { expect, test } from '../support/fixtures';
import {
	multisigAddressOf,
	setupMultisig,
	signInViaApi,
} from '../support/scenarios';

test.describe('create multisig wizard', () => {
	test('holds Continue until every signer is complete and unique', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const { page } = alice;
		const rows = signerRows(page);
		const continueButton = page.getByTestId(
			'create-continue',
		);
		const blockedReason = page.getByTestId(
			'create-blocked-reason',
		);
		const addressMessage = page.getByTestId(
			'create-preview-address-message',
		);

		await alice.signIn();
		await page.goto('/create');
		await nameMultisig(page, 'Checks');

		await test.step('the creator alone', async () => {
			await expect(rows).toHaveCount(1);
			await expect(
				page.getByTestId('create-too-few'),
			).toBeVisible();
			await expect(continueButton).toBeDisabled();
		});

		await test.step('a key that is already used', async () => {
			await addSigners(page, [
				{ label: 'Bob', key: bob.publicKey },
				{ label: 'Bob again', key: bob.publicKey },
			]);
			await expect(
				page.getByTestId('create-too-few'),
			).toHaveCount(0);
			await expect(
				rows.nth(2).getByTestId('create-signer-status'),
			).toHaveText(
				'Bob (signer 2) already uses this key. Each signer needs their own key.',
			);
			await expect(blockedReason).toHaveText(
				'Finish or remove signer 3 to continue.',
			);
			await expect(addressMessage).toHaveText(
				'Finish or remove signer 3 to see the address.',
			);
			await expect(
				page.getByTestId('create-preview-signers'),
			).toHaveText('2 (+1 incomplete)');
			await expect(continueButton).toBeDisabled();

			await rows
				.nth(2)
				.getByTestId('create-signer-remove')
				.click();
			await expect(rows).toHaveCount(2);
			await expect(blockedReason).toHaveCount(0);
			await expect(
				page.getByTestId('create-preview-address'),
			).toHaveText(
				multisigAddressOf(
					[{ identity: alice }, { identity: bob }],
					1,
				),
			);
			await expect(continueButton).toBeEnabled();
		});
	});

	test('finds a public key from an address, and holds Continue when it can’t', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		// Signing in registers Bob's address with the API.
		const bob = createIdentity('bob');
		await signInViaApi(bob);
		const { page } = alice;
		const rows = signerRows(page);
		const continueButton = page.getByTestId(
			'create-continue',
		);

		await alice.signIn();
		await page.goto('/create');
		await nameMultisig(page, 'Lookups');

		await test.step('a registered address', async () => {
			await addSigners(page, [{ key: bob.address }]);
			await expect(
				rows.nth(1).getByTestId('create-signer-key'),
			).toHaveValue(bob.publicKey);
			await expect(rows.nth(1)).toHaveAttribute(
				'data-status',
				'valid',
			);
			await expect(continueButton).toBeEnabled();
		});

		// Public networks are blocked in tests, so only the API could know it.
		await test.step('an address with no key on record', async () => {
			await addSigners(page, [
				{ label: 'Dave', key: randomAddress() },
			]);
			await expect(
				rows.nth(2).getByTestId('create-signer-status'),
			).toHaveText(
				'No public key found for this address. It hasn’t signed a transaction yet. Ask Dave for their public key.',
			);
			await expect(
				page.getByTestId('create-blocked-reason'),
			).toHaveText(
				'Add a public key for signer 3, or remove the row, to continue.',
			);
			await expect(continueButton).toBeDisabled();
		});
	});

	test('keeps the setup when create fails, and tries again', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const { page } = alice;
		const submit = page.getByTestId('create-submit');
		const error = page.getByTestId('create-error');
		const expectedAddress = multisigAddressOf(
			[{ identity: alice }, { identity: bob }],
			2,
		);

		await alice.signIn();
		await reviewMultisig(page, {
			name: 'Retry',
			signers: [{ label: 'Bob', key: bob.publicKey }],
			threshold: 2,
		});

		// The request is held, then never reaches the API.
		const createRoute = '**/multisig';
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route(createRoute, async (route) => {
			if (route.request().method() !== 'POST')
				return route.fallback();
			await held;
			return route.abort();
		});
		await submit.click();

		// While it is pending, nothing can leave the step or the page.
		await expect(submit).toHaveText('Creating multisig…');
		await expect(
			page.getByTestId('create-cancel'),
		).toBeDisabled();
		await expect(
			page.getByTestId('create-step-1'),
		).toBeDisabled();
		release();

		await expect(error).toHaveText(
			'Couldn’t create the multisig. Nothing was sent to the signers and your setup is still here. Check your connection and try again.',
		);
		await expect(submit).toHaveText('Try again');
		await expect(page).toHaveURL(/\/create$/);
		await expect(
			page.getByTestId('create-review-address'),
		).toHaveText(expectedAddress);

		await page.unroute(createRoute);
		await submit.click();
		await expect(
			page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			expectedAddress,
		);
	});

	test("shows the API's reason when it refuses the setup", async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
			accept: false,
		});
		const { page } = alice;

		await alice.signIn();
		await reviewMultisig(page, {
			name: 'Twice',
			signers: [{ key: bob.publicKey }],
			threshold: 2,
		});
		await page.getByTestId('create-submit').click();

		await expect(
			page.getByTestId('create-error'),
		).toContainText('already exists');
		await expect(
			page.getByTestId('create-submit'),
		).toHaveText('Try again');
		await expect(page).toHaveURL(/\/create$/);
	});

	test('the steps are links once the ones before them are valid', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const { page } = alice;
		const step = (n: number) =>
			page.getByTestId(`create-step-${n}`);

		await alice.signIn();
		await page.goto('/create');
		// Nothing is named yet, so the later steps are out of reach.
		await expect(step(2)).toBeDisabled();
		await expect(step(3)).toBeDisabled();

		await nameMultisig(page, 'Steps');
		await expect(step(1)).toBeEnabled();
		// The creator alone can't continue, so Review stays out of reach.
		await expect(step(3)).toBeDisabled();
		await addSigners(page, [
			{ label: 'Bob', key: bob.publicKey },
		]);
		await step(3).click();
		await expect(
			page.getByTestId('create-review-step'),
		).toBeVisible();

		// From Review back to the name, then straight to Review again.
		await step(1).click();
		await expect(
			page.getByTestId('create-name-input'),
		).toHaveValue('Steps');
		await step(3).click();
		await expect(
			page.getByTestId('create-review-step'),
		).toBeVisible();

		// Clearing the name closes the later steps again.
		await step(1).click();
		await page.getByTestId('create-name-input').fill('');
		await expect(step(2)).toBeDisabled();
		await expect(step(3)).toBeDisabled();
	});

	test('editing or clearing a row touches that row alone', async ({
		createActor,
		createIdentity,
	}) => {
		// Pins a bug where two rows shared an id, so a change to one hit
		// both: pasting the same key into two rows must keep them apart.
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const { page } = alice;
		const rows = signerRows(page);

		await alice.signIn();
		await page.goto('/create');
		await nameMultisig(page, 'Rows');
		await addSigners(page, [
			{ label: 'Bob', key: bob.publicKey },
			{ label: 'Bob again', key: bob.publicKey },
			{ label: 'Carol', key: bob.publicKey },
		]);
		await expect(rows).toHaveCount(4);

		// Clearing the last duplicate leaves the other two untouched.
		await rows
			.nth(3)
			.getByTestId('create-signer-key-clear')
			.click();
		await expect(
			rows.nth(3).getByTestId('create-signer-key'),
		).toHaveValue('');
		await expect(
			rows.nth(2).getByTestId('create-signer-key'),
		).toHaveValue(bob.publicKey);
		await expect(
			rows.nth(1).getByTestId('create-signer-key'),
		).toHaveValue(bob.publicKey);

		// Typing in one row's name changes no other row.
		await rows
			.nth(2)
			.getByTestId('create-signer-label')
			.fill('Only me');
		await expect(
			rows.nth(1).getByTestId('create-signer-label'),
		).toHaveValue('Bob');
		await expect(
			rows.nth(3).getByTestId('create-signer-label'),
		).toHaveValue('Carol');
		await expect(
			rows.nth(2).getByTestId('create-signer-weight'),
		).toHaveValue('1');
		await rows
			.nth(2)
			.getByTestId('create-signer-weight-increase')
			.click();
		await expect(
			rows.nth(2).getByTestId('create-signer-weight'),
		).toHaveValue('2');
		await expect(
			rows.nth(1).getByTestId('create-signer-weight'),
		).toHaveValue('1');
	});

	test('clearing a key for a moment keeps the threshold', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const carol = createIdentity('carol');
		const { page } = alice;
		const rows = signerRows(page);
		const threshold = page.getByTestId('create-threshold');

		await alice.signIn();
		await page.goto('/create');
		await nameMultisig(page, 'Steady');
		await addSigners(page, [
			{ label: 'Bob', key: bob.publicKey, weight: 2 },
			{ label: 'Carol', key: carol.publicKey },
		]);
		await setThreshold(page, 3);

		// Bob's weight still counts while his key is missing.
		await rows
			.nth(1)
			.getByTestId('create-signer-key-clear')
			.click();
		await expect(threshold).toHaveValue('3');
		await rows
			.nth(1)
			.getByTestId('create-signer-key')
			.fill(bob.publicKey);
		await expect(rows.nth(1)).toHaveAttribute(
			'data-status',
			'valid',
		);
		await expect(threshold).toHaveValue('3');
		await expect(
			page.getByTestId('create-continue'),
		).toBeEnabled();
	});

	test('warns that everyone must sign whenever no signer can be spared', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const carol = createIdentity('carol');
		const { page } = alice;
		const warning = page.getByTestId(
			'create-threshold-warning',
		);

		await alice.signIn();
		await page.goto('/create');
		await nameMultisig(page, 'Weights');
		// Weights 2 and 2 at a threshold of 3: both must sign, though the
		// threshold is below the total.
		await signerRows(page)
			.first()
			.getByTestId('create-signer-weight-increase')
			.click();
		await addSigners(page, [
			{ label: 'Bob', key: bob.publicKey, weight: 2 },
		]);
		await setThreshold(page, 3);
		await expect(warning).toHaveText(
			'Every signer must sign every proposal. If one signer loses their key, the multisig can’t move funds.',
		);
		// A third signer of weight 1 can be spared, so the warning goes.
		await addSigners(page, [{ key: carol.publicKey }]);
		await expect(warning).toHaveCount(0);
	});
});
