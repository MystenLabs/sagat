// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Flows and edge cases of the new-proposal wizard, around the paths
// new-proposal.spec.ts covers: browser history, reloads, deep links, an
// empty account, long and unusual titles, and unusual bytes.
import { Transaction } from '@mysten/sui/transactions';
import {
	MIST_PER_SUI,
	normalizeSuiAddress,
	toBase58,
	toBase64,
} from '@mysten/sui/utils';
import { type Page } from '@playwright/test';

import {
	COPY,
	type ProposalType,
} from '../../app/src/lib/new-proposal';
import {
	randomAddress,
	SUI_TYPE,
	type Chain,
} from '../support/chain';
import {
	expect,
	test,
	type Fixtures,
} from '../support/fixtures';
import {
	bytesOnReview,
	chooseType,
	expectSimulation,
	fillTransfer,
	openNewProposal,
	pasteBytes,
	proposeAndSign,
	recordCreates,
	reviewBytes,
	reviewTransfer,
	sharedAccount,
} from '../support/new-proposal';
import { setupMultisig } from '../support/scenarios';
import { testCoinType } from '../support/test-coin';

/**
 * Alice and Bob share an account, funded unless `fund` is false; Alice is
 * signed in and has the wizard open on it, on Details for `type` if given.
 * 2-of-2, so Alice's proposals stay pending.
 */
async function openWizard(
	fixtures: Fixtures,
	{
		fund = true,
		type,
	}: { fund?: boolean; type?: ProposalType } = {},
) {
	const { alice, multisig } = await sharedAccount(
		fixtures,
		2,
		{ fund },
	);
	await openNewProposal(alice.page, multisig.address, {
		type,
	});
	return { page: alice.page, account: multisig.address };
}

// Base64 bytes of a 1 SUI transfer from `sender`, built by the test.
function suiTransferBytes(
	chain: Chain,
	sender: string,
	expiration?: Parameters<Transaction['setExpiration']>[0],
) {
	return chain.buildSuiTransfer({
		sender,
		recipient: randomAddress(),
		amount: MIST_PER_SUI,
		expiration,
	});
}

// Uncaught errors on the page, which a crash would show up as.
function recordPageErrors(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (error) =>
		errors.push(error.message),
	);
	return errors;
}

// From the Type step, a 1 SUI transfer on Review, simulated.
async function transferOnReview(page: Page) {
	await chooseType(page, 'transfer');
	await fillTransfer(page, {
		coinType: SUI_TYPE,
		amount: '1',
		recipient: randomAddress(),
	});
	await reviewTransfer(page);
	await expectSimulation(page, 'success');
}

test.describe('new proposal edges: history and links', () => {
	// BUG: (rough edge) the steps aren't history entries, so the browser's
	// Back on Review doesn't go back a step: it leaves the wizard and the
	// draft is gone, without asking. Nothing is inconsistent (no Review
	// without a preview), only lost.
	test('browser Back from Review leaves the wizard for the previous page, and Forward opens a fresh Type step', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page } = await openWizard({
			createActor,
			createIdentity,
			chain,
		});
		const errors = recordPageErrors(page);
		await transferOnReview(page);

		await page.goBack();
		await expect(
			page.getByTestId('new-proposal-page'),
		).toHaveCount(0);
		await expect(page).toHaveURL(
			(url) => !url.pathname.endsWith('/proposals/new'),
		);

		await page.goForward();
		await expect(
			page.getByTestId('new-proposal-stepper'),
		).toHaveAttribute('data-step', '1');
		await expect(
			page.getByTestId('type-step'),
		).toBeVisible();
		await chooseType(page, 'transfer');
		await expect(
			page.getByTestId('transfer-asset-select'),
		).not.toHaveAttribute('data-coin-type');
		await expect(
			page.getByTestId('transfer-amount-input'),
		).toHaveValue('');
		expect(errors).toEqual([]);
	});

	test('reloading on Review keeps the wizard open on the same account', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page, account } = await openWizard({
			createActor,
			createIdentity,
			chain,
		});
		const errors = recordPageErrors(page);
		await transferOnReview(page);

		await page.reload();
		await expect(
			page.getByTestId('type-step'),
		).toBeVisible();
		await expect(page).toHaveURL(
			`/multisig/${account}/proposals/new`,
		);
		expect(errors).toEqual([]);
	});

	test('an unknown ?type= opens the Type step, and an ?asset= that isn’t a coin or isn’t held preselects nothing', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page, account } = await openWizard({
			createActor,
			createIdentity,
			chain,
		});
		const errors = recordPageErrors(page);
		const wizard = `/multisig/${account}/proposals/new`;

		await page.goto(`${wizard}?type=nonsense`);
		await expect(
			page.getByTestId('type-step'),
		).toBeVisible();

		// A real coin type the account doesn't hold.
		for (const asset of ['notacoin', testCoinType()]) {
			await page.goto(
				`${wizard}?type=transfer&asset=${encodeURIComponent(asset)}`,
			);
			const select = page.getByTestId(
				'transfer-asset-select',
			);
			await expect(
				select.getByText('Choose an asset'),
			).toBeVisible();
			await expect(
				page.getByTestId('transfer-max-button'),
			).toHaveCount(0);
			await expect(select).not.toHaveAttribute(
				'data-coin-type',
			);
			await expect(
				page.getByTestId('transfer-asset-error'),
			).toHaveCount(0);
		}
		expect(errors).toEqual([]);
	});

	// BUG: (rough edge) a wizard link for an account the signer isn't in
	// (or that doesn't exist) silently lands on the signer's own account,
	// via the dashboard's redirect (NewProposalPage). Expected some
	// word that the linked account isn't one of theirs; the user may now
	// propose from the wrong account without noticing.
	test('a wizard link for an account the signer isn’t in, or that doesn’t exist, doesn’t open the wizard on it', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page } = await openWizard({
			createActor,
			createIdentity,
			chain,
		});
		const theirs = await setupMultisig({
			creator: createIdentity('carol'),
			members: [createIdentity('dave')],
			threshold: 1,
		});

		for (const address of [
			theirs.address,
			randomAddress(),
		]) {
			await page.goto(
				`/multisig/${address}/proposals/new?type=transfer`,
			);
			await expect(page).toHaveURL(
				(url) => !url.pathname.includes(address),
			);
		}
	});
});

test.describe('new proposal edges: an empty account', () => {
	test('an account with no balances shows “No assets to send” and can’t reach Review', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page } = await openWizard(
			{ createActor, createIdentity, chain },
			{ fund: false, type: 'transfer' },
		);

		const select = page.getByTestId(
			'transfer-asset-select',
		);
		await expect(select).toContainText('No assets to send');
		await expect(select).toBeDisabled();
		await fillTransfer(page, {
			amount: '1',
			recipient: randomAddress(),
		});
		await expect(
			page.getByTestId('transfer-review'),
		).toBeDisabled();
	});
});

test.describe('new proposal edges: title', () => {
	test('a 501-character title blocks Review on Details, and Propose when typed on Review', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page, account } = await openWizard(
			{ createActor, createIdentity, chain },
			{ type: 'bytes' },
		);
		const input = page.getByTestId('proposal-title-input');
		const review = page.getByTestId('bytes-review');

		await pasteBytes(
			page,
			await suiTransferBytes(chain, account),
			'a'.repeat(500),
		);
		await expect(review).toBeEnabled();
		await input.fill('a'.repeat(501));
		await input.blur();
		await expect(
			page.getByTestId('proposal-title-hint'),
		).toHaveText(COPY.titleTooLong(501));
		await expect(review).toBeDisabled();

		await input.fill('Short');
		await reviewBytes(page);
		await expectSimulation(page, 'success');
		await page.getByTestId('review-edit-title').click();
		const editor = page.getByTestId('review-title-input');
		await editor.fill('a'.repeat(501));
		await editor.press('Enter');
		await expect(
			page.getByTestId('review-submit'),
		).toBeDisabled();
	});

	test('leading and trailing spaces are trimmed from the title shown and sent', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page, account } = await openWizard(
			{ createActor, createIdentity, chain },
			{ type: 'bytes' },
		);
		const creates = recordCreates(page);

		await bytesOnReview(
			page,
			await suiTransferBytes(chain, account),
			'   Pay the designer  \t ',
		);
		await expect(
			page.getByTestId('review-title'),
		).toHaveText('Pay the designer');
		await expectSimulation(page, 'success');
		await proposeAndSign(page);
		expect(
			creates.map((r) => r.postDataJSON().description),
		).toEqual(['Pay the designer']);
	});

	test('Escape in the Review title editor keeps the title', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page, account } = await openWizard(
			{ createActor, createIdentity, chain },
			{ type: 'bytes' },
		);
		await bytesOnReview(
			page,
			await suiTransferBytes(chain, account),
			'Keep me',
		);

		await page.getByTestId('review-edit-title').click();
		const editor = page.getByTestId('review-title-input');
		await editor.pressSequentially(' and not this');
		await editor.press('Escape');
		await expect(editor).toHaveCount(0);
		await expect(
			page.getByTestId('review-title'),
		).toHaveText('Keep me');
		await expect(
			page.getByTestId('review-step'),
		).toBeVisible();
	});
});

test.describe('new proposal edges: bytes', () => {
	test('bytes pasted with whitespace around are read and proposed trimmed', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page, account } = await openWizard(
			{ createActor, createIdentity, chain },
			{ type: 'bytes' },
		);
		const creates = recordCreates(page);
		const bytes = await suiTransferBytes(chain, account);

		await bytesOnReview(
			page,
			`\n\n  \t${bytes} \n\n`,
			'Trimmed',
		);
		await page.getByTestId('review-raw-toggle').click();
		await expect(
			page.getByTestId('review-raw-transaction'),
		).toHaveValue(bytes);
		await expectSimulation(page, 'success');
		await proposeAndSign(page);
		expect(
			creates.map((r) => r.postDataJSON().transactionBytes),
		).toEqual([bytes]);
	});

	test('bytes wrapped across lines are read as one transaction and proposed', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page, account } = await openWizard(
			{ createActor, createIdentity, chain },
			{ type: 'bytes' },
		);
		const creates = recordCreates(page);
		const bytes = await suiTransferBytes(chain, account);

		await bytesOnReview(
			page,
			bytes.match(/.{1,76}/g)!.join('\n'),
			'Wrapped',
		);
		await expectSimulation(page, 'success');
		await proposeAndSign(page);
		await expect(
			page.getByTestId('proposal-card'),
		).toHaveCount(1);
		expect(
			creates.map((r) => r.postDataJSON().transactionBytes),
		).toEqual([bytes]);
	});

	test('bytes expiring at the end of the current epoch show the expiry and simulate', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page, account } = await openWizard(
			{ createActor, createIdentity, chain },
			{ type: 'bytes' },
		);
		await bytesOnReview(
			page,
			await suiTransferBytes(chain, account, {
				Epoch: await chain.epoch(),
			}),
			'This epoch only',
		);
		await expect(
			page
				.getByTestId('review-expiry')
				.getByTestId('proposal-expiry'),
		).toHaveText(/^Expires in /);
		await expectSimulation(page, 'success');
		await proposeAndSign(page);
	});

	test('bytes that expired in an earlier epoch show “Expired” and a failed simulation', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const epoch = await chain.epoch();
		// A fresh local network stays in epoch 0 for its first hour (see
		// start-localnet.sh), and epoch 0 hasn't ended, so nothing can have
		// expired yet.
		test.skip(
			epoch === 0,
			'Needs a network past epoch 0 for an expired epoch',
		);
		const { page, account } = await openWizard(
			{ createActor, createIdentity, chain },
			{ type: 'bytes' },
		);
		// Built offline, with the gas pinned: building with a client would
		// simulate the expired transaction and refuse it.
		const [coins, { referenceGasPrice }] =
			await Promise.all([
				chain.coins(account),
				chain.client.getReferenceGasPrice(),
			]);
		const tx = new Transaction();
		tx.setSender(account);
		tx.setGasPayment(coins);
		tx.setGasPrice(BigInt(referenceGasPrice));
		tx.setGasBudget(10_000_000n);
		tx.setExpiration({ Epoch: epoch - 1 });
		const [coin] = tx.splitCoins(tx.gas, [MIST_PER_SUI]);
		tx.transferObjects([coin], randomAddress());
		await bytesOnReview(
			page,
			toBase64(await tx.build()),
			'Expired',
		);
		await expect(
			page
				.getByTestId('review-expiry')
				.getByTestId('proposal-expiry'),
		).toHaveText('Expired');
		await expectSimulation(page, 'failure');
		await expect(
			page.getByTestId('review-simulation-error'),
		).toContainText('expired');
	});

	// Bytes built for another network: the sender is the account, but the
	// gas coin doesn't exist here.
	// BUG: (rough edge) the reason is the node's text as it is, "Error
	// checking transaction input objects: Could not find the referenced
	// object 0x… at version None.": readable, but "version None" is a Rust
	// Option leaking through, and nothing hints that the bytes may be for
	// another network.
	test('bytes paying gas with a coin that doesn’t exist fail the simulation with a reason, and proposing them anyway shows the API’s refusal', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page, account } = await openWizard(
			{ createActor, createIdentity, chain },
			{ type: 'bytes' },
		);
		const gasCoin = normalizeSuiAddress(randomAddress());
		const tx = new Transaction();
		tx.setSender(account);
		tx.setGasPayment([
			{
				objectId: gasCoin,
				version: '7',
				digest: toBase58(new Uint8Array(32).fill(7)),
			},
		]);
		tx.setGasPrice(1_000n);
		tx.setGasBudget(10_000_000n);
		const [coin] = tx.splitCoins(tx.gas, [1n]);
		tx.transferObjects([coin], randomAddress());

		await bytesOnReview(
			page,
			toBase64(await tx.build()),
			'Another network',
		);
		await expectSimulation(page, 'failure');
		await expect(
			page.getByTestId('review-simulation-error'),
		).toContainText(gasCoin);
		const submit = page.getByTestId('review-submit');
		await expect(submit).toHaveText(
			'Propose and sign anyway',
		);
		await submit.click();
		const refused = page.getByTestId('review-create-error');
		await expect(refused).toBeVisible();
		await expect(refused).not.toHaveText(COPY.createFailed);
	});
});
