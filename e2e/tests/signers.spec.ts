// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersonalMessages } from '@mysten/sagat';
import {
	formatAddress,
	formatDigest,
	MIST_PER_SUI,
	normalizeStructTag,
	SUI_TYPE_ARG,
} from '@mysten/sui/utils';

import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';
import {
	proposeTransfer,
	setupMultisig,
	signInViaApi,
	signProposal,
} from '../support/scenarios';
import { mintTestCoin } from '../support/test-coin';

test.describe('overview and signers', () => {
	test('show the setup, each key by its label and weight, and who created it', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const carol = createIdentity('carol');
		// Carol is unnamed and hasn't answered yet.
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob, carol],
			weights: [2, 1, 1],
			threshold: 3,
			name: 'Treasury',
			labels: ['Alice', 'Bob', null],
			accept: false,
		});
		await bob.api.acceptMultisigInvite(multisig.address, {
			signature: await bob.signMessage(
				PersonalMessages.acceptMultisigInvitation(
					multisig.address,
				),
			),
		});
		await signInViaApi(alice);
		const saved = await alice.api.getMultisig(
			multisig.address,
		);
		expect(saved.createdAt).not.toBeNull();

		await alice.signIn();
		const { page } = alice;
		await expect(
			page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			multisig.address,
		);

		await test.step('the overview sums the account up', async () => {
			await page
				.getByTestId('multisig-tab-overview')
				.click();
			await expect(
				page.getByRole('heading', { level: 1 }),
			).toHaveText('Overview');
			// The account is the eyebrow over the title.
			await expect(
				page.getByTestId('page-header-eyebrow'),
			).toHaveText('Treasury');
			await expect(
				page.getByTestId('open-proposals-empty'),
			).toBeVisible();
		});

		await test.step('the signers list each key with its label and weight', async () => {
			await page
				.getByTestId('multisig-tab-signers')
				.click();
			await expect(
				page.getByRole('heading', { level: 1 }),
			).toHaveText('Members');
			await expect(
				page.getByTestId('multisig-tab-signers'),
			).toHaveText('Members');
			await expect(
				page.getByTestId('signers-summary'),
			).toHaveText('2 of 3 accepted');
			await expect(
				page.getByTestId('signers-notice'),
			).toHaveCount(0);

			const you = alice.memberItem(alice.address);
			await expect(
				you.getByTestId('member-label'),
			).toHaveText('Alice');
			await expect(you).toContainText('(you)');
			await expect(
				you.getByTestId('member-weight'),
			).toHaveText('2');
			await expect(you).toHaveAttribute(
				'data-status',
				'accepted',
			);

			const him = alice.memberItem(bob.address);
			await expect(
				him.getByTestId('member-label'),
			).toHaveText('Bob');
			await expect(him).not.toContainText('(you)');
			await expect(
				him.getByTestId('member-weight'),
			).toHaveText('1');
			await expect(him).toHaveAttribute(
				'data-status',
				'accepted',
			);

			// An unnamed key goes by its short address, still invited.
			const her = alice.memberItem(carol.address);
			await expect(
				her.getByTestId('member-label'),
			).toHaveCount(0);
			await expect(her).toContainText(
				formatAddress(carol.address),
			);
			await expect(her).toHaveAttribute(
				'data-status',
				'pending',
			);
			await expect(her).toContainText('Invited');

			// The setup card has the numbers, when the account was created
			// and by whom: the signed-in key, named by its label.
			const setup = page.getByTestId('account-setup');
			await expect(
				setup.getByTestId('setup-threshold'),
			).toHaveText('3 of 4');
			await expect(
				setup.getByTestId('setup-signers'),
			).toHaveText('3');
			await expect(
				setup.getByTestId('setup-created'),
			).toHaveAttribute(
				'data-created-at',
				saved.createdAt!,
			);
			await expect(
				setup.getByTestId('setup-created-by'),
			).toHaveText('Alice (you)');
			// Suiscan doesn't index localnet, so only the download shows.
			await expect(
				setup.getByTestId('setup-explorer-link'),
			).toHaveCount(0);
			await expect(
				setup.getByTestId('setup-download'),
			).toBeVisible();
		});
	});

	test('name the creator for other members and call out a rejected signer', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = createIdentity('alice');
		const bob = await createActor('bob');
		const carol = createIdentity('carol');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob, carol],
			threshold: 2,
			name: 'Grants',
			labels: ['Alice', 'Bob', null],
			accept: false,
		});
		await bob.api.acceptMultisigInvite(multisig.address, {
			signature: await bob.signMessage(
				PersonalMessages.acceptMultisigInvitation(
					multisig.address,
				),
			),
		});
		await carol.api.rejectMultisigInvite(multisig.address, {
			signature: await carol.signMessage(
				PersonalMessages.rejectMultisigInvitation(
					multisig.address,
				),
			),
		});

		await bob.signIn();
		const { page } = bob;
		await expect(
			page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			multisig.address,
		);

		await page.getByTestId('multisig-tab-signers').click();
		// Alice and Bob together still reach the threshold of 2.
		const notice = page.getByTestId('signers-notice');
		await expect(notice).toHaveAttribute(
			'data-tone',
			'warning',
		);
		await expect(notice).toContainText(
			`${formatAddress(carol.address)} rejected the invitation to join this account. The other signers can still reach the threshold.`,
		);
		await expect(
			page.getByTestId('signers-summary'),
		).toHaveText(
			`2 of 3 accepted · ${formatAddress(carol.address)} rejected`,
		);
		await expect(
			bob.memberItem(carol.address),
		).toHaveAttribute('data-status', 'rejected');
		await expect(bob.memberItem(bob.address)).toContainText(
			'(you)',
		);
		await expect(
			page.getByTestId('setup-created-by'),
		).toHaveText('Alice');
	});
	test('add and remove an external proposer', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const payments = createIdentity('payments');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 1,
			labels: ['Alice', 'Bob'],
		});

		await alice.signIn();
		const { page } = alice;
		await expect(
			page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			multisig.address,
		);
		await page.getByTestId('multisig-tab-signers').click();

		const card = page.getByTestId('proposers-card');
		await expect(
			card.getByTestId('proposers-empty'),
		).toBeVisible();

		// Adding signs a message with the wallet.
		await card.getByTestId('add-proposer-button').click();
		const add = page.getByRole('dialog', {
			name: 'Add external proposer',
		});
		const input = add.getByLabel('Address', {
			exact: true,
		});
		const status = add.getByTestId(
			'add-proposer-address-status',
		);
		const submit = add.getByRole('button', {
			name: 'Add proposer',
			exact: true,
		});

		await test.step('an incomplete address shows why once left', async () => {
			await input.fill(payments.address.slice(0, -8));
			await input.blur();
			await expect(status).toHaveAttribute(
				'data-state',
				'invalid',
			);
			await expect(status).toHaveText(
				'This isn’t a valid Sui address. Check you pasted all of it: 0x and 64 characters.',
			);
			await expect(submit).toBeDisabled();
		});

		await test.step('clearing empties the field and its status', async () => {
			const clear = add.getByTestId(
				'add-proposer-address-clear',
			);
			await clear.click();
			await expect(input).toHaveValue('');
			await expect(clear).toHaveCount(0);
			await expect(status).toHaveCount(0);
		});

		await test.step('a whole address reads as valid', async () => {
			await input.fill(payments.address);
			await expect(status).toHaveAttribute(
				'data-state',
				'valid',
			);
			await expect(status).toHaveText('Valid Sui address');
		});

		await submit.click();
		const item = card.getByTestId('proposer-item');
		await expect(item).toHaveCount(1);
		await expect(item).toHaveAttribute(
			'data-address',
			payments.address,
		);
		await expect(item).toContainText(
			formatAddress(payments.address),
		);
		await expect(
			item.getByTestId('proposer-added'),
		).toHaveAttribute('data-added-at', /.+/);
		await expect(
			item.getByTestId('proposer-added-by'),
		).toHaveText('by Alice (you)');
		await expect(
			card.getByTestId('proposers-empty'),
		).toHaveCount(0);

		// Removing asks first, showing the short address and carrying
		// the whole one in `data-address`.
		const remove = item.getByTestId(
			'remove-proposer-button',
		);
		await expect(remove).toHaveAccessibleName(
			`Remove ${formatAddress(payments.address)}`,
		);
		await remove.click();
		const confirm = page.getByRole('dialog', {
			name: 'Remove external proposer?',
		});
		await expect(confirm).toHaveAttribute(
			'data-address',
			payments.address,
		);
		await expect(confirm).toContainText(
			formatAddress(payments.address),
		);
		await confirm
			.getByRole('button', {
				name: 'Remove',
				exact: true,
			})
			.click();
		await expect(
			card.getByTestId('proposer-item'),
		).toHaveCount(0);
		await expect(
			card.getByTestId('proposers-empty'),
		).toBeVisible();
	});

	test('list the open proposals and execute the one that is ready', async ({
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
			name: 'Treasury',
			labels: ['Alice', 'Bob'],
		});
		// One gas coin per proposal, so both can be pending at once.
		const coins = await chain.fundWithCoins(
			multisig.address,
			{ count: 2, amount: 10n * MIST_PER_SUI },
		);
		// Bob's proposal still needs Alice; Alice's has Bob's signature too.
		const pending = await proposeTransfer(chain, bob, {
			multisigAddress: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
			description: 'Pay the grants wallet',
			gasCoin: coins[0],
		});
		const ready = await proposeTransfer(chain, alice, {
			multisigAddress: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
			gasCoin: coins[1],
		});
		await signProposal(bob, ready);
		// The registry prices SUI, but its prices are mainnet's: on localnet
		// neither coin gets a value.
		await mintTestCoin(chain, multisig.address, [
			1_000_000n,
		]);
		await alice.stubRecognizedCoins([
			{
				coinType: normalizeStructTag(SUI_TYPE_ARG),
				symbol: 'SUI',
				name: 'Sui',
				decimals: 9,
				priceUsd: 1.5,
			},
		]);

		await alice.signIn();
		const { page } = alice;
		await page.getByTestId('multisig-tab-overview').click();
		const rows = page.getByTestId('proposal-row');
		await expect(rows).toHaveCount(2);

		await test.step('the value, the tokens, receive and send', async () => {
			const value = page.getByTestId('account-value');
			await expect(value).toHaveAttribute(
				'data-unpriced',
				'2',
			);
			await expect(value).not.toHaveAttribute('data-usd');
			await expect(
				value.getByTestId('account-value-amount'),
			).toHaveText('—');
			await expect(value).toContainText(
				'No prices for the tokens this account holds.',
			);
			await expect(value).not.toContainText('Excludes');
			const sui = page.locator(
				'[data-testid="token-row"][data-coin-type$="::sui::SUI"]',
			);
			await expect(sui).toContainText('SUI');
			// SUI leads; the funder paid every fee, so both coins are whole.
			await expect(
				page.getByTestId('token-row').first(),
			).toHaveAttribute('data-coin-type', /::sui::SUI$/);
			await expect(
				sui.getByTestId('token-balance'),
			).toHaveText('20');
			await expect(
				sui.getByTestId('token-value'),
			).toHaveText('—');
			const testCoin = page.locator(
				'[data-testid="token-row"][data-coin-type$="::test_coin::TEST_COIN"]',
			);
			await expect(
				testCoin.getByTestId('token-balance'),
			).toHaveText('1');
			await expect(
				testCoin.getByTestId('token-value'),
			).toHaveText('—');

			await page
				.getByTestId('overview-receive-button')
				.click();
			const dialog = page.getByTestId('receive-dialog');
			await expect(
				dialog.getByTestId('receive-address'),
			).toHaveText(multisig.address);
			await page.keyboard.press('Escape');
			await expect(dialog).toBeHidden();

			await page
				.getByTestId('overview-send-button')
				.click();
			await expect(
				page.getByTestId('transfer-step'),
			).toBeVisible();
			await page.goBack();

			await page.getByTestId('view-all-assets').click();
			await expect(
				page.getByRole('heading', { level: 1 }),
			).toHaveText('Assets');
			await page
				.getByTestId('multisig-tab-overview')
				.click();
			await expect(rows).toHaveCount(2);
		});

		await test.step("a token's Send proposes a transfer of that coin", async () => {
			const testCoin = page.locator(
				'[data-testid="token-row"][data-coin-type$="::test_coin::TEST_COIN"]',
			);
			await testCoin
				.getByTestId('token-send-button')
				.click();
			await expect(
				page.getByTestId('transfer-step'),
			).toBeVisible();
			await expect(
				page.getByTestId('transfer-asset-select'),
			).toHaveAttribute(
				'data-coin-type',
				/::test_coin::TEST_COIN$/,
			);
			await page.goBack();
		});

		await test.step('each open proposal shows its title, proposer, status and weight', async () => {
			const row = alice.proposalRow(pending.digest);
			await expect(row).toHaveAttribute(
				'data-status',
				'pending',
			);
			await expect(
				row.getByTestId('proposal-status'),
			).toHaveText('Pending');
			await expect(
				row.getByTestId('proposal-title'),
			).toHaveText('Pay the grants wallet');
			await expect(
				row.getByTestId('proposal-proposer'),
			).toHaveText('Proposed by Bob');
			const weight = row.getByTestId('proposal-weight');
			await expect(weight).toHaveAttribute(
				'data-current-weight',
				'1',
			);
			await expect(weight).toHaveAttribute(
				'data-total-weight',
				'2',
			);
			await weight.hover();
			await expect(page.getByRole('tooltip')).toHaveText(
				'1 of 2',
			);
			await expect(
				row.getByTestId('execute-proposal-button'),
			).toHaveCount(0);

			const other = alice.proposalRow(ready.digest);
			await expect(other).toHaveAttribute(
				'data-status',
				'ready',
			);
			await expect(
				other.getByTestId('proposal-status'),
			).toHaveText('Ready');
			// Without a description, the proposal goes by its digest.
			await expect(
				other.getByTestId('proposal-title'),
			).toHaveText(
				`Transaction ${formatDigest(ready.digest)}`,
			);
			await expect(
				other.getByTestId('proposal-proposer'),
			).toHaveText('Proposed by Alice (you)');
			await expect(
				other.getByTestId('proposal-weight'),
			).toHaveAttribute('data-current-weight', '2');
		});

		await test.step('executing a ready proposal takes it off the list', async () => {
			await alice
				.proposalRow(ready.digest)
				.getByTestId('execute-proposal-button')
				.click();
			await expect(
				page.locator(
					'[data-sonner-toast][data-type="success"]',
					{ hasText: 'Proposal executed' },
				),
			).toBeVisible();
			await expect(
				alice.proposalRow(ready.digest),
			).toHaveCount(0);
			await expect(rows).toHaveCount(1);
		});

		await test.step('the link leads to the proposals tab', async () => {
			await page.getByTestId('view-all-proposals').click();
			await expect(
				page.getByRole('heading', { level: 1 }),
			).toHaveText('Proposals');
			await expect(
				alice.proposalRow(pending.digest),
			).toBeVisible();
		});
	});
});
