// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersonalMessages } from '@mysten/sagat';
import {
	type AccountDetails,
	type Proposal,
} from '@mysten/sagat/v1';
import {
	formatAddress,
	formatDigest,
	fromBase64,
	MIST_PER_SUI,
	normalizeStructTag,
	SUI_TYPE_ARG,
	toBase64,
} from '@mysten/sui/utils';
import { type Locator } from '@playwright/test';

import { content } from '../../app/src/content';
import { docsUrl } from '../../app/src/lib/docs';
import { networkLabel } from '../../app/src/lib/network';
import type { Actor } from '../support/actor';
import {
	randomAddress,
	type Chain,
} from '../support/chain';
import { E2E } from '../support/env';
import { expect, test } from '../support/fixtures';
import type { Identity } from '../support/identity';
import {
	executeProposal,
	expectOnProposal,
	expectSimulation,
	fillTransfer,
	openNewProposal,
	proposeAndSign,
	reviewTransfer,
} from '../support/new-proposal';
import {
	isAccountListRead,
	isCreateRequest,
} from '../support/requests';
import {
	acceptAccountInvite,
	addAlias,
	addProposer,
	aliasCallBytes,
	bothSign,
	enableAliases,
	multisigAddressOf,
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
		chain,
	}) => {
		// Waits out one poll of the empty account's balances.
		test.slow();
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
			).toHaveText('No proposals yet.');
			// Nothing funded it: worth $0.00, with nothing to send or list.
			await expect(
				page.getByTestId('account-value-amount'),
			).toHaveText('$0.00');
			await expect(
				page.getByTestId('tokens-empty'),
			).toBeVisible();
			await expect(
				page.getByTestId('overview-send-button'),
			).toHaveCount(0);
			await expect(
				page.getByTestId('overview-receive-button'),
			).toBeVisible();
			await expect(
				page.getByTestId('view-all-assets'),
			).toHaveCount(0);
		});

		await test.step('coins sent while the overview is open show without a reload', async () => {
			await chain.fund(multisig.address);
			// Just over the 30 seconds between polls of an empty account.
			await expect(
				page.getByTestId('token-row'),
			).toBeVisible({ timeout: 35_000 });
			await expect(
				page.getByTestId('overview-send-button'),
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
			`${formatAddress(carol.address)} rejected the invitation to join this pod, but can still sign a proposal you share.`,
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
		await expect(
			card.getByTestId('learn-more-link'),
		).toHaveAttribute(
			'href',
			docsUrl('/guide/external-proposers#confirmations'),
		);

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
		// Adding signs it, so the row names the signer who confirmed it.
		await expect(item).toHaveAttribute(
			'data-status',
			'verified',
		);
		await expect(
			item.getByTestId('proposer-added-by'),
		).toHaveText('Confirmed by Alice (you)');
		await expect(
			item.getByTestId('reconfirm-proposer-button'),
		).toHaveCount(0);
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

	test('re-confirm a proposer that has no signature on record', async ({
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
		await addProposer(
			alice,
			multisig.address,
			payments.address,
		);

		// Hides the first recorded event, as for a proposer added before events were kept.
		let hidden: number | undefined;
		await alice.page.route(
			`${E2E.apiUrl}/v1/accounts/${multisig.address}?*`,
			async (route) => {
				const response = await route.fetch();
				const account =
					(await response.json()) as AccountDetails;
				await route.fulfill({
					response,
					json: {
						...account,
						proposers: account.proposers.map((p) => {
							hidden ??= p.event?.id;
							return p.event?.id === hidden
								? { ...p, event: null }
								: p;
						}),
					},
				});
			},
		);

		await alice.signIn();
		const { page } = alice;
		await page.getByTestId('multisig-tab-signers').click();
		const item = page
			.getByTestId('proposers-card')
			.getByTestId('proposer-item');
		await expect(item).toHaveAttribute(
			'data-status',
			'unverified',
		);
		await expect(
			item.getByTestId('proposer-status'),
		).toHaveText('Unverified');
		await expect(
			item.getByTestId('proposer-added-by'),
		).toHaveText('by Alice (you)');

		const reconfirm = item.getByTestId(
			'reconfirm-proposer-button',
		);
		await expect(reconfirm).toHaveAccessibleName(
			`Re-confirm ${formatAddress(payments.address)}`,
		);
		await reconfirm.click();
		// Re-confirming signs only from the add dialog, prefilled.
		const add = page.getByRole('dialog', {
			name: 'Add external proposer',
		});
		await expect(
			add.getByLabel('Address', { exact: true }),
		).toHaveValue(payments.address);
		await add
			.getByRole('button', {
				name: 'Add proposer',
				exact: true,
			})
			.click();
		await expect(item).toHaveAttribute(
			'data-status',
			'verified',
		);
		await expect(
			item.getByTestId('proposer-added-by'),
		).toHaveText('Confirmed by Alice (you)');
		await expect(
			item.getByTestId('proposer-status'),
		).toHaveCount(0);
		await expect(reconfirm).toHaveCount(0);
	});

	test('offer only Remove for a proposer whose signature doesn’t match', async ({
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
		await addProposer(
			alice,
			multisig.address,
			payments.address,
		);

		// Flips a byte of the recorded signature, after the scheme flag.
		await alice.page.route(
			`${E2E.apiUrl}/v1/accounts/${multisig.address}?*`,
			async (route) => {
				const response = await route.fetch();
				const account =
					(await response.json()) as AccountDetails;
				await route.fulfill({
					response,
					json: {
						...account,
						proposers: account.proposers.map((p) => {
							if (!p.event?.proof) return p;
							const bytes = fromBase64(
								String(p.event.proof.signature),
							);
							bytes[1] ^= 0xff;
							return {
								...p,
								event: {
									...p.event,
									proof: {
										...p.event.proof,
										signature: toBase64(bytes),
									},
								},
							};
						}),
					},
				});
			},
		);

		await alice.signIn();
		const { page } = alice;
		await page.getByTestId('multisig-tab-signers').click();
		const item = page
			.getByTestId('proposers-card')
			.getByTestId('proposer-item');
		await expect(item).toHaveAttribute(
			'data-status',
			'invalid',
		);
		await expect(
			item.getByTestId('proposer-status'),
		).toHaveText('Doesn’t check out');
		await expect(
			item.getByTestId('reconfirm-proposer-button'),
		).toHaveCount(0);
		await expect(
			item.getByTestId('remove-proposer-button'),
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
		// The registry's prices are mainnet's, but SUI is the same type on
		// every network, so on localnet it gets a value. The test coin doesn't.
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
				'1',
			);
			await expect(value).toHaveAttribute('data-usd', '30');
			await expect(
				value.getByTestId('account-value-amount'),
			).toHaveText('$30.00');
			await expect(value).toContainText(
				'Excludes 1 token without a price.',
			);
			await expect(value).not.toContainText('No prices');
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
			).toHaveText('$30.00');
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
			).toHaveText(formatDigest(ready.digest));
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
				page.getByTestId('proposal-filter-all'),
			).toHaveAttribute('data-active');
			await expect(
				alice.proposalRow(pending.digest),
			).toBeVisible();
		});
	});

	test('show every signer set that acts, named after a pod only for its own signers', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = await createActor('bob');
		const carol = createIdentity('carol');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
			name: 'Treasury',
			labels: ['Alice', 'Bob'],
		});
		// A composition the API holds: a pod of Alice's and Carol's.
		const recovery = await setupMultisig({
			creator: alice,
			members: [carol],
			threshold: 2,
			name: 'Recovery',
			labels: ['Alice', 'Carol'],
		});
		await chain.fund(multisig.address);
		// Before the pod's first /v1 read, so the API sees it at once.
		await addAlias(
			chain,
			bothSign(alice, bob),
			recovery.address,
		);
		const folded = (page: typeof alice.page) =>
			page.locator(
				`[data-testid="folded-signer-set"][data-signer-set="${recovery.address}"]`,
			);
		const member = (scope: Locator, address: string) =>
			scope.locator(
				`[data-testid="member-item"][data-address="${address}"]`,
			);

		await test.step('a signer of both sees both, the other one named after her pod', async () => {
			await alice.signIn();
			const { page } = alice;
			await page.goto(
				`/multisig/${multisig.address}/signers`,
			);
			await expect(
				page.getByTestId('several-signer-sets'),
			).toHaveText(
				'This pod has 2 signer sets on Localnet. Each one can approve transactions on its own.',
			);
			// She signs in both, so the card is the pod's own set.
			const own = page.locator(
				`[data-testid="signers-card"][data-signer-set="${multisig.address}"]`,
			);
			await expect(
				own.getByTestId('signer-set-threshold'),
			).toHaveText('Threshold 2 of 2');
			await expect(
				member(own, alice.address),
			).toBeVisible();
			await expect(member(own, bob.address)).toBeVisible();
			// The pod's own set needs no address or name.
			await expect(
				own.getByTestId('signer-set-address'),
			).toHaveCount(0);

			// The other set is folded under the table, its count in view.
			const toggle = own.getByTestId(
				'other-acting-sets-toggle',
			);
			await expect(toggle).toHaveText('1 more signer set');
			const added = folded(page);
			await expect(added).toHaveCount(0);
			await toggle.click();
			await expect(
				added.getByTestId('signer-set-threshold'),
			).toHaveText('Threshold 2 of 2');
			await expect(
				member(added, carol.address),
			).toBeVisible();
			await expect(
				added.getByTestId('signer-set-address'),
			).toHaveText(recovery.address);
			await expect(
				added.getByTestId('signer-set-pod-name'),
			).toHaveText('Recovery');
			await expect(
				page.getByTestId('other-signer-sets'),
			).toHaveCount(0);
			await expect(
				page.getByTestId('setup-network'),
			).toHaveText('Localnet');

			await added.getByTestId('open-pod-link').click();
			await expect(
				page.getByTestId('multisig-detail'),
			).toHaveAttribute(
				'data-multisig-address',
				recovery.address,
			);
		});

		await test.step('a signer of the pod alone sees the other set by its address', async () => {
			await bob.signIn();
			const { page } = bob;
			await page.goto(
				`/multisig/${multisig.address}/signers`,
			);
			await page
				.getByTestId('other-acting-sets-toggle')
				.click();
			const added = folded(page);
			await expect(
				added.getByTestId('signer-set-address'),
			).toHaveText(recovery.address);
			await expect(
				added.getByTestId('signer-set-pod-name'),
			).toHaveCount(0);
			await expect(
				added.getByTestId('open-pod-link'),
			).toHaveCount(0);
		});
	});

	test('list the aliases no signer set makes up under other signer sets', async ({
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
		});
		const recovery = await setupMultisig({
			creator: alice,
			members: [
				createIdentity('carol'),
				createIdentity('dave'),
			],
			threshold: 2,
			name: 'Treasury Recovery',
		});
		await chain.fund(multisig.address);
		const stranger = randomAddress();
		await addAlias(chain, bothSign(alice, bob), stranger);

		const { page } = alice;
		// The first /v1 read has the API keep this alias set for a minute.
		const listed = page.waitForResponse(isAccountListRead);
		await alice.signIn();
		await listed;
		await page.goto(
			`/multisig/${multisig.address}/signers`,
		);

		const card = page.getByTestId('other-signer-sets');
		const toggle = card.getByTestId(
			'other-signer-sets-toggle',
		);
		const rows = card.getByTestId('other-signer-set');

		await test.step('an address nobody knows, collapsed under a count', async () => {
			await expect(
				card.getByTestId('other-signer-sets-count'),
			).toHaveText('1');
			await expect(rows).toHaveCount(0);

			await toggle.click();
			await expect(card).toContainText(
				'This address has other signer sets. Each one can approve transactions from this address on Localnet on its own, without this pod’s signers.',
			);
			await expect(rows).toHaveCount(1);
			await expect(rows).toHaveAttribute(
				'data-address',
				stranger,
			);
			await expect(rows).toContainText(
				'Added outside Pods',
			);
			await expect(rows).toContainText('No details');
		});

		await test.step('a pod of hers the API doesn’t list as acting yet', async () => {
			await addAlias(
				chain,
				bothSign(alice, bob),
				recovery.address,
			);
			await page.reload();
			await expect(
				page.getByTestId('other-acting-sets'),
			).toHaveCount(0);
			await expect(
				card.getByTestId('other-signer-sets-count'),
			).toHaveText('2');
			await toggle.click();
			const row = rows.and(
				page.locator(
					`[data-address="${recovery.address}"]`,
				),
			);
			await expect(
				row.getByTestId('other-signer-set-name'),
			).toHaveText('Treasury Recovery');
			await expect(row).toContainText('Created in Pods');
			await expect(row).toContainText('3 signers');
			await expect(row).toContainText('Threshold 2 of 3');
			await expect(
				row.getByTestId('open-pod-link'),
			).toHaveAttribute(
				'href',
				`/multisig/${recovery.address}/overview`,
			);
		});
	});

	test('enable signer changes with a proposal, and stop offering it once it executed', async ({
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
		});
		await chain.fund(multisig.address);
		await alice.signIn();
		const { page } = alice;
		const members = `/multisig/${multisig.address}/signers`;
		const enable = page
			.getByTestId('signers-card')
			.getByTestId('enable-signer-changes');
		const banner = page.getByTestId(
			'enable-signer-changes-pending',
		);
		await page.goto(members);

		const created = page.waitForResponse((response) =>
			isCreateRequest(response.request()),
		);
		await enable.click();
		const proposal = (await (
			await created
		).json()) as Proposal;
		const proposalPage = alice.proposalPage(
			proposal.digest,
		);
		await expect(proposalPage).toHaveAttribute(
			'data-status',
			'pending',
		);
		await expect(
			page.getByTestId('alias-calls-warning'),
		).toHaveText(
			content.transactionPreview.aliasCalls.enablesChanges(
				'Localnet',
			),
		);

		await page.goto(members);
		await expect(banner).toContainText(
			content.signers.enableSignerChangesPending(
				'Localnet',
			),
		);
		await expect(enable).toHaveCount(0);
		await page
			.getByTestId('enable-signer-changes-proposal')
			.click();
		await expect(proposalPage).toBeVisible();

		await signProposal(bob, proposal);
		await page.reload();
		await page
			.getByTestId('execute-proposal-button')
			.click();
		await expect(proposalPage).toHaveAttribute(
			'data-status',
			'executed',
		);

		const accountRead = page.waitForResponse(
			(response) =>
				response.request().method() === 'GET' &&
				new URL(response.url()).pathname.endsWith(
					`/v1/accounts/${multisig.address}`,
				),
		);
		await page.getByTestId('multisig-tab-signers').click();
		expect(
			((await (await accountRead).json()) as AccountDetails)
				.signerChangesEnabled,
		).toBe(true);
		await expect(enable).toHaveCount(0);
		await expect(banner).toHaveCount(0);
	});

	test('replace a signer from Members and propose the change, then hold new changes while it’s open', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const carol = createIdentity('carol');
		const dave = createIdentity('dave');
		const {
			multisig,
			change: { digest },
		} = await replaceFromMembers(
			{ alice, bob, carol, chain },
			dave.publicKey,
			{ label: 'Dave' },
		);
		const { page } = alice;
		await expect(alice.proposalPage(digest)).toBeVisible();
		const changes = page.getByTestId(
			'signer-change-changes',
		);
		for (const kind of ['add', 'remove'])
			await expect(
				changes.locator(
					`[data-testid="change-item"][data-kind="${kind}"]`,
				),
			).toHaveCount(1);
		await expect(
			changes.getByTestId('change-item'),
		).toHaveCount(2);
		await expect(
			changes.locator(
				'[data-testid="change-item"][data-kind="add"]',
			),
		).toContainText('Dave');
		await expect(
			page.getByTestId('alias-calls-warning'),
		).toHaveCount(0);

		const proposal =
			await alice.apiV1.getProposalByDigest(digest);
		expect(proposal.kind).toBe('signer_change');
		expect(proposal.signerChange).toEqual({
			removes: multisig.address,
			adds: multisigAddressOf(
				[alice, bob, dave].map((identity) => ({
					identity,
				})),
				2,
			),
			labels: [
				{ publicKey: dave.publicKey, label: 'Dave' },
			],
		});

		await page.getByTestId('multisig-tab-signers').click();
		await expect(
			page.getByTestId('signer-change-pending'),
		).toContainText(
			`(${content.common.thresholdLabel(1, 2)} weight)`,
		);
		await expect(
			page.getByTestId('signer-change-proposal'),
		).toHaveAttribute(
			'href',
			`/multisig/${multisig.address}/proposals/${digest}`,
		);
		await expect(
			page.getByTestId('signers-add-signer'),
		).toBeDisabled();
		await expect(
			page.getByTestId('change-threshold'),
		).toBeDisabled();
		for (const menu of await page
			.getByTestId('signer-menu')
			.all())
			await expect(menu).toBeDisabled();
	});

	test('hold new changes while a hand-written alias proposal is open, and say why', async ({
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
		});
		await chain.fund(multisig.address);
		await enableAliases(chain, bothSign(alice, bob));
		const transactionBytes = await aliasCallBytes(
			chain,
			multisig.address,
			'add',
		);
		const { digest } = await alice.apiV1.createProposal({
			accountAddress: multisig.address,
			transactionBytes,
			signature: await alice.signTransaction(
				transactionBytes,
			),
			network: 'localnet',
		});

		await alice.signIn();
		const { page } = alice;
		await page.goto(
			`/multisig/${multisig.address}/signers`,
		);
		await expect(
			page.getByTestId('alias-proposal-pending'),
		).toContainText(content.signers.aliasProposalPending);
		await expect(
			page.getByTestId('alias-proposal'),
		).toHaveAttribute(
			'href',
			`/multisig/${multisig.address}/proposals/${digest}`,
		);
		await expect(
			page.getByTestId('signer-change-pending'),
		).toHaveCount(0);
		await expect(
			page.getByTestId('signers-add-signer'),
		).toBeDisabled();
		await expect(
			page.getByTestId('change-threshold'),
		).toBeDisabled();
		for (const menu of await page
			.getByTestId('signer-menu')
			.all())
			await expect(menu).toBeDisabled();
	});

	test('a signer change executes from its page with no Cancel for the removed signer, who is told once, then the new signers propose a transfer and a second change and sign them', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		test.slow();
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const carol = await createActor('carol');
		const dave = await createActor('dave');
		const { multisig, change } = await replaceFromMembers(
			{ alice, bob, carol, chain },
			dave.publicKey,
			{ name: 'Treasury' },
		);
		const newSet = multisigAddressOf(
			[alice, bob, dave].map((identity) => ({ identity })),
			2,
		);
		const members = `/multisig/${multisig.address}/signers`;

		await test.step('Alice and Bob replace Carol with Dave, and Dave accepts', async () => {
			const { page } = alice;
			const changePath = `/multisig/${multisig.address}/proposals/${change.digest}`;
			await carol.signIn();
			await carol.page.goto(changePath);
			await expect(
				carol.page.getByTestId('signer-change-removed'),
			).toBeVisible();
			await expect(
				carol.page.locator(
					'[data-testid="change-item"][data-kind="remove"]',
				),
			).toContainText(content.signers.markers.you.parens);
			await expect(
				carol.page.getByTestId('cancel-proposal-button'),
			).toHaveCount(0);
			await signProposal(bob, change);
			await page.goto(
				`/multisig/${multisig.address}/proposals`,
			);
			await page
				.getByTestId('proposal-filter-ready')
				.click();
			const row = alice.proposalRow(change.digest);
			await expect(
				row.getByTestId('proposal-execute-from-page'),
			).toBeVisible();
			await expect(
				row.getByTestId('execute-proposal-button'),
			).toHaveCount(0);
			await page.goto(changePath);
			await executeProposal(page);
			await page.reload();
			for (const signer of [alice, bob])
				await expect(
					page.locator(
						`[data-testid="approval-row"][data-address="${signer.address}"]`,
					),
				).toHaveAttribute('data-signed', 'true');

			await carol.page.goto('/');
			// Split at a placeholder for the date, which isn't rebuilt.
			const [removal] = content.toasts
				.removedFromPod(
					'Treasury',
					networkLabel('localnet'),
					'\0',
				)
				.split('\0');
			const notice = carol.page
				.locator('[data-sonner-toast]')
				.filter({ hasText: removal });
			await expect(notice).toBeVisible();
			// Told once: not again on the next read.
			await carol.page.reload();
			await expect(
				carol.page.getByTestId('dashboard-empty'),
			).toBeVisible();
			await expect(notice).toHaveCount(0);
			await carol.page.goto(members);
			await expect(
				carol.page.getByTestId('pod-no-longer-signer'),
			).toHaveText(
				content.overview.noLongerSigner(
					networkLabel('localnet'),
				),
			);
			await expect(
				carol.page.getByTestId('pod-refused'),
			).toHaveCount(0);

			await signInViaApi(dave);
			await acceptAccountInvite(dave, multisig.address);
		});

		const { page } = dave;
		await dave.signIn();

		await test.step('Dave proposes a transfer from the wizard, Alice signs, Dave executes', async () => {
			await openNewProposal(page, multisig.address, {
				type: 'transfer',
			});
			await fillTransfer(page, {
				coinType: SUI_TYPE_ARG,
				amount: '1',
				recipient: randomAddress(),
			});
			await reviewTransfer(page);
			await expectSimulation(page, 'success');
			const digest = await proposeAndSign(page);
			await signProposal(
				alice,
				await alice.apiV1.getProposalByDigest(digest),
			);
			await page.reload();
			await executeProposal(page);
		});

		await test.step('Dave proposes a second change, 3 of 3, from Members, and Alice signs it', async () => {
			await page.goto(members);
			await page.getByTestId('change-threshold').click();
			const threshold = page
				.getByTestId('change-signers-step')
				.getByTestId('change-threshold');
			await threshold.fill('3');
			await threshold.blur();
			await page.getByTestId('change-review').click();
			const created = page.waitForResponse((response) =>
				isCreateRequest(response.request()),
			);
			await page.getByTestId('review-submit').click();
			const { digest } = (await (
				await created
			).json()) as Proposal;
			await expectOnProposal(
				page,
				multisig.address,
				digest,
			);

			const proposal =
				await dave.apiV1.getProposalByDigest(digest);
			expect(proposal.kind).toBe('signer_change');
			expect(proposal.signerChange).toEqual({
				removes: newSet,
				adds: multisigAddressOf(
					[alice, bob, dave].map((identity) => ({
						identity,
					})),
					3,
				),
				labels: [],
			});
			await signProposal(alice, proposal);
			await page.reload();
			await expect(
				dave.proposalPage(digest),
			).toHaveAttribute('data-status', 'ready');
		});
	});

	test('say the pod has no SUI when enabling signer changes can’t pay gas', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const multisig = await setupMultisig({
			creator: alice,
			members: [createIdentity('bob')],
			threshold: 2,
		});
		await alice.signIn();
		const { page } = alice;
		await page.goto(
			`/multisig/${multisig.address}/signers`,
		);
		await page.getByTestId('enable-signer-changes').click();
		await expect(
			page
				.locator('[data-sonner-toast]')
				.filter({ hasText: content.common.noGas }),
		).toBeVisible();
	});
});

// On a 2-of-3 pod with Bob and Carol (without Carol, 2-of-2 with Bob), Alice proposes replacing the last of them with `key` from Members.
async function replaceFromMembers(
	{
		alice,
		bob,
		carol,
		chain,
	}: {
		alice: Actor;
		bob: Identity;
		carol?: Identity;
		chain: Chain;
	},
	key: string,
	{ label, name }: { label?: string; name?: string } = {},
) {
	const others = carol ? [bob, carol] : [bob];
	const replaced = others[others.length - 1];
	const multisig = await setupMultisig({
		creator: alice,
		members: others,
		threshold: 2,
		name,
	});
	await chain.fund(multisig.address);
	await enableAliases(chain, {
		members: [alice, ...others].map((identity) => ({
			identity,
		})),
		threshold: 2,
		signers: [alice, bob],
	});
	await alice.signIn();
	const { page } = alice;
	await page.goto(`/multisig/${multisig.address}/signers`);
	await page
		.locator(
			`[data-testid="member-item"][data-address="${replaced.address}"]`,
		)
		.getByTestId('signer-menu')
		.click();
	await page.getByTestId('signer-menu-replace').click();
	await page
		.getByTestId('create-signer-key')
		.nth(others.length)
		.fill(key);
	if (label)
		await page
			.getByTestId('create-signer-label')
			.nth(others.length)
			.fill(label);
	await page.getByTestId('change-review').click();
	const created = page.waitForResponse((response) =>
		isCreateRequest(response.request()),
	);
	await page.getByTestId('review-submit').click();
	const change = (await (await created).json()) as Proposal;
	return { multisig, change };
}
