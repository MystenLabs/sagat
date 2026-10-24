// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Flows and edge cases of the new-proposal wizard, around the paths
// new-proposal.spec.ts covers: browser history, reloads, deep links,
// accounts without gas or assets, long and unusual titles, double
// submits, unusual bytes, coin reuse and a declined signature.
import { Transaction } from '@mysten/sui/transactions';
import {
	MIST_PER_SUI,
	normalizeStructTag,
	toBase58,
	toBase64,
} from '@mysten/sui/utils';
import { type Page, type Request } from '@playwright/test';

import { type Actor } from '../support/actor';
import {
	randomAddress,
	SUI_TYPE,
	type Chain,
} from '../support/chain';
import { E2E } from '../support/env';
import { expect, test } from '../support/fixtures';
import { type Identity } from '../support/identity';
import {
	chooseAsset,
	chooseType,
	clickNewProposal,
	expectOnProposals,
	expectSimulation,
	fillTransfer,
	openNewProposal,
	pasteBytes,
	proposeAndSign,
	reviewBytes,
	reviewTransfer,
} from '../support/new-proposal';
import {
	proposeTransfer,
	setupMultisig,
} from '../support/scenarios';
import { mintTestCoin } from '../support/test-coin';

type Fixtures = {
	createActor: (name: string) => Promise<Actor>;
	createIdentity: (name: string) => Identity;
	chain: Chain;
};

// Alice and Bob share an account; Alice is signed in on it. 2-of-2, so
// Alice's proposals stay pending. `fund: false` leaves it empty.
async function account(
	{ createActor, createIdentity, chain }: Fixtures,
	{ fund = true }: { fund?: boolean } = {},
) {
	const alice = await createActor('alice');
	const bob = createIdentity('bob');
	const multisig = await setupMultisig({
		creator: alice,
		members: [bob],
		threshold: 2,
	});
	if (fund) await chain.fund(multisig.address);
	await alice.signIn();
	return { alice, bob, multisig };
}

function isCreateRequest(request: Request) {
	const url = new URL(request.url());
	return (
		request.method() === 'POST' &&
		url.origin === E2E.apiUrl &&
		url.pathname.endsWith('/proposals')
	);
}

// Every POST /proposals the page sends, as it sends it.
function recordCreates(page: Page) {
	const creates: Request[] = [];
	page.on('request', (request) => {
		if (isCreateRequest(request)) creates.push(request);
	});
	return creates;
}

// Uncaught errors on the page, which a crash would show up as.
function recordPageErrors(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (error) =>
		errors.push(error.message),
	);
	return errors;
}

function toast(page: Page, type: 'success' | 'error') {
	return page.locator(
		`[data-sonner-toast][data-type="${type}"]`,
	);
}

// Base64 bytes of a SUI transfer from `sender`, built by the test.
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

test.describe('new proposal edges: browser history', () => {
	// BUG: (rough edge) the steps aren't history entries, so the browser's
	// Back on Review doesn't go back a step: it leaves the wizard and the
	// draft is gone, without asking. Forward then opens a fresh wizard.
	// Nothing is inconsistent (no Review without a preview), only lost.
	test('browser Back on Review leaves for the proposals, and Forward opens a clean Type step', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const errors = recordPageErrors(page);

		await clickNewProposal(page);
		await chooseType(page, 'transfer');
		await fillTransfer(page, {
			coinType: SUI_TYPE,
			amount: '1',
			recipient: randomAddress(),
		});
		await reviewTransfer(page);
		await expectSimulation(page, 'success');

		await page.goBack();
		await expectOnProposals(page);

		await page.goForward();
		await expect(
			page.getByTestId('type-step'),
		).toBeVisible();
		await expect(
			page.getByTestId('new-proposal-stepper'),
		).toHaveAttribute('data-step', '1');
		// The draft is gone: Review isn't reachable from the stepper.
		await expect(
			page.getByTestId('new-proposal-step-3'),
		).toBeDisabled();
		await chooseType(page, 'transfer');
		await expect(
			page.getByTestId('transfer-amount-input'),
		).toHaveValue('');
		expect(errors).toEqual([]);
	});

	test('browser Forward on Details after Back from Review does nothing, and the draft and Review stay', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const recipient = randomAddress();

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await fillTransfer(page, {
			coinType: SUI_TYPE,
			amount: '2',
			recipient,
		});
		await reviewTransfer(page);
		await expectSimulation(page, 'success');
		await page.getByTestId('review-back').click();
		await expect(
			page.getByTestId('transfer-step'),
		).toBeVisible();

		await page.goForward();
		await expect(
			page.getByTestId('transfer-step'),
		).toBeVisible();
		await expect(
			page.getByTestId('transfer-amount-input'),
		).toHaveValue('2');
		await expect(
			page.getByTestId('transfer-recipient-input'),
		).toHaveValue(recipient);

		// The stepper's Review shows the kept simulation, not an empty one.
		await page.getByTestId('new-proposal-step-3').click();
		await expectSimulation(page, 'success');
		await expect(
			page.getByTestId('review-simulating'),
		).toHaveCount(0);
	});
});

test.describe('new proposal edges: reload', () => {
	test('reloading on Review lands on a clean Type step on the same account', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const errors = recordPageErrors(page);

		await clickNewProposal(page);
		await chooseType(page, 'transfer');
		await fillTransfer(page, {
			coinType: SUI_TYPE,
			amount: '1',
			recipient: randomAddress(),
		});
		await reviewTransfer(page);
		await expectSimulation(page, 'success');

		await page.reload();
		await expect(
			page.getByTestId('type-step'),
		).toBeVisible();
		await expect(page).toHaveURL(
			`/multisig/${multisig.address}/proposals/new`,
		);
		await expect(
			page.getByTestId('new-proposal-step-3'),
		).toBeDisabled();
		expect(errors).toEqual([]);
	});

	test('reloading on Details opened with ?type= lands on that Details step, empty', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const errors = recordPageErrors(page);

		await openNewProposal(page, multisig.address, {
			type: 'bytes',
		});
		await pasteBytes(
			page,
			await suiTransferBytes(chain, multisig.address),
			'A title',
		);
		await page.reload();
		await expect(
			page.getByTestId('bytes-step'),
		).toBeVisible();
		await expect(
			page.getByTestId('bytes-input'),
		).toHaveValue('');
		await expect(
			page.getByTestId('proposal-title-input'),
		).toHaveValue('');
		expect(errors).toEqual([]);
	});
});

test.describe('new proposal edges: deep links', () => {
	test('an unknown ?type= opens the Type step', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		await page.goto(
			`/multisig/${multisig.address}/proposals/new?type=nonsense`,
		);
		await expect(
			page.getByTestId('type-step'),
		).toBeVisible();
		await expect(
			page.getByTestId('proposal-type-transfer'),
		).toHaveAttribute('data-checked');
	});

	test('an ?asset= that isn’t a coin type, or one the account doesn’t hold, is dropped without an error', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const errors = recordPageErrors(page);
		// A real coin type, minted to someone else.
		const testCoin = await mintTestCoin(
			chain,
			randomAddress(),
			[1n],
		);

		for (const asset of ['notacoin', testCoin]) {
			await page.goto(
				`/multisig/${multisig.address}/proposals/new?type=transfer&asset=${encodeURIComponent(asset)}`,
			);
			const select = page.getByTestId(
				'transfer-asset-select',
			);
			await expect(select).toContainText('Choose an asset');
			await expect(select).not.toHaveAttribute(
				'data-coin-type',
			);
			await expect(
				page.getByTestId('transfer-asset-error'),
			).toHaveCount(0);
			// Once dropped, there's no symbol or Max for it.
			await expect(
				page.getByTestId('transfer-max-button'),
			).toHaveCount(0);
		}
		expect(errors).toEqual([]);
	});

	test('?type=bytes&asset= opens the bytes step, and the asset waits for a transfer', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		await page.goto(
			`/multisig/${multisig.address}/proposals/new?type=bytes&asset=${normalizeStructTag(SUI_TYPE)}`,
		);
		await expect(
			page.getByTestId('bytes-step'),
		).toBeVisible();

		await page.getByTestId('details-back').click();
		await chooseType(page, 'transfer');
		await expect(
			page.getByTestId('transfer-asset-select'),
		).toHaveAttribute('data-coin-type', /::sui::SUI$/);
	});

	// BUG: the preselected asset is matched against the balances as an
	// exact string (TransferDetailsStep.tsx:86 and :165), so the short
	// form 0x2::sui::SUI, which is how people write it, isn't recognised
	// and is dropped once the balances load. Only the app's own links
	// (asset row, overview Send) pass the long form. Expected SUI chosen.
	test('?asset=0x2::sui::SUI preselects SUI like the long form does', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		await openNewProposal(page, multisig.address, {
			type: 'transfer',
			coinType: SUI_TYPE,
		});
		await expect(
			page.getByTestId('transfer-asset-select'),
		).toHaveAttribute('data-coin-type', /::sui::SUI$/);
	});

	// BUG: (rough edge) a wizard link for an account the signer isn't in
	// (or that doesn't exist) silently lands on the signer's own account,
	// via the dashboard's redirect (NewProposalPage.tsx:70). Expected some
	// word that the linked account isn't one of theirs; the user may now
	// propose from the wrong account without noticing.
	test('the wizard for an account the signer isn’t in, or that doesn’t exist, leaves the wizard', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const carol = createIdentity('carol');
		const dave = createIdentity('dave');
		const theirs = await setupMultisig({
			creator: carol,
			members: [dave],
			threshold: 1,
		});

		for (const address of [
			theirs.address,
			randomAddress(),
		]) {
			await page.goto(
				`/multisig/${address}/proposals/new?type=transfer`,
			);
			// Lands on Alice's own account, without a word.
			await expect(page).toHaveURL(
				`/multisig/${multisig.address}/proposals`,
			);
		}
	});
});

test.describe('new proposal edges: accounts without gas or assets', () => {
	// BUG: an account with TEST but no SUI can't pay gas, so building the
	// transfer fails. Expected a message saying the account needs SUI for
	// gas; actual: "Couldn’t build the transfer. Check your connection and
	// try again." (COPY.buildFailed, TransferDetailsStep.tsx:406), which
	// sends the user after their connection.
	test('Max on a coin with no SUI for gas fails on Details with a message about gas', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account(
			{ createActor, createIdentity, chain },
			{ fund: false },
		);
		const { page } = alice;
		const testCoin = await mintTestCoin(
			chain,
			multisig.address,
			[5_000_000n],
		);
		const creates = recordCreates(page);

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await chooseAsset(page, testCoin);
		await page.getByTestId('transfer-max-button').click();
		await expect(
			page.getByTestId('transfer-amount-input'),
		).toHaveValue('5');
		const recipient = page.getByTestId(
			'transfer-recipient-input',
		);
		await recipient.fill(randomAddress());
		await recipient.blur();
		await page.getByTestId('transfer-review').click();

		const error = page.getByTestId('transfer-error');
		await expect(error).toBeVisible();
		await expect(
			page.getByTestId('review-step'),
		).toHaveCount(0);
		expect(creates).toHaveLength(0);
		await expect(error).toContainText(/gas|SUI/);
	});

	test('an account with no balances shows “No assets to send” and Review stays out of reach', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account(
			{ createActor, createIdentity, chain },
			{ fund: false },
		);
		const { page } = alice;

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		const select = page.getByTestId(
			'transfer-asset-select',
		);
		await expect(select).toContainText('No assets to send');
		await expect(select).toBeDisabled();
		await expect(
			page.getByTestId('transfer-max-button'),
		).toHaveCount(0);
		await page
			.getByTestId('transfer-amount-input')
			.fill('1');
		const recipient = page.getByTestId(
			'transfer-recipient-input',
		);
		await recipient.fill(randomAddress());
		await recipient.blur();
		await expect(
			page.getByTestId('transfer-review'),
		).toBeDisabled();
		await expect(
			page.getByTestId('new-proposal-step-3'),
		).toBeDisabled();
	});
});

test.describe('new proposal edges: title', () => {
	// Pastes bytes from the account and types `title`.
	async function bytesWithTitle(
		page: Page,
		chain: Chain,
		address: string,
		title: string,
	) {
		await openNewProposal(page, address, {
			type: 'bytes',
		});
		await pasteBytes(
			page,
			await suiTransferBytes(chain, address),
			title,
		);
	}

	test('500 characters are allowed and 501 are refused with the count', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const hint = page.getByTestId('proposal-title-hint');
		const review = page.getByTestId('bytes-review');

		await bytesWithTitle(
			page,
			chain,
			multisig.address,
			'a'.repeat(500),
		);
		await expect(hint).not.toHaveAttribute(
			'data-state',
			'error',
		);
		await expect(review).toBeEnabled();

		const input = page.getByTestId('proposal-title-input');
		await input.fill('a'.repeat(501));
		await input.blur();
		await expect(hint).toHaveAttribute(
			'data-state',
			'error',
		);
		await expect(hint).toHaveText(
			'501 of 500 characters. Use 500 or fewer.',
		);
		await expect(review).toBeDisabled();
	});

	test('emoji and combining characters count as code points after NFC', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const hint = page.getByTestId('proposal-title-hint');
		const input = page.getByTestId('proposal-title-input');

		// 500 emoji are 1,000 UTF-16 units but 500 code points.
		await bytesWithTitle(
			page,
			chain,
			multisig.address,
			'😀'.repeat(500),
		);
		await expect(hint).not.toHaveAttribute(
			'data-state',
			'error',
		);
		await input.fill('😀'.repeat(501));
		await input.blur();
		await expect(hint).toHaveText(
			'501 of 500 characters. Use 500 or fewer.',
		);
		// e + combining acute composes to é: 500, not 1,000.
		await input.fill('é'.repeat(500));
		await expect(hint).not.toHaveAttribute(
			'data-state',
			'error',
		);
		// A skin-toned thumbs-up is two code points.
		await input.fill('👍🏽'.repeat(251));
		await expect(hint).toHaveText(
			'502 of 500 characters. Use 500 or fewer.',
		);
	});

	// BUG: the length check counts code points after NFC (textLength in
	// lib/create-multisig.ts:84), but the title is sent as typed
	// (NewProposalPage.tsx:199), and the API stores it in a
	// varchar(1000) without a check of its own (api/src/db/schema.ts:165).
	// 500 Hangul syllables typed as conjoining jamo pass the check (500
	// after NFC) but are 1,500 code points, so the insert fails and the
	// user gets the generic "Couldn’t create the proposal. … Check your
	// connection and try again." notice (the API logs Postgres 22001).
	// Expected: the proposal is created (send the NFC form, or count what
	// is sent).
	test('a 500-character title that is longer before NFC is still proposed', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		// 각 as three conjoining jamo.
		const title = '각'.repeat(500);
		expect(title.normalize('NFC')).toHaveLength(500);

		await bytesWithTitle(
			page,
			chain,
			multisig.address,
			title,
		);
		await expect(
			page.getByTestId('proposal-title-hint'),
		).not.toHaveAttribute('data-state', 'error');
		await reviewBytes(page);
		await expectSimulation(page, 'success');
		await page.getByTestId('review-submit').click();
		await expectOnProposals(page);
	});

	test('leading and trailing spaces are trimmed from the title shown and sent', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const creates = recordCreates(page);

		await bytesWithTitle(
			page,
			chain,
			multisig.address,
			'   Pay the designer  \t ',
		);
		await reviewBytes(page);
		await expect(
			page.getByTestId('review-title'),
		).toHaveText('Pay the designer');
		await expectSimulation(page, 'success');
		await proposeAndSign(page);
		expect(creates).toHaveLength(1);
		expect(creates[0].postDataJSON().description).toBe(
			'Pay the designer',
		);
	});

	test('a title cleared on Review shows “No title”, and typing it again brings it back', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const creates = recordCreates(page);
		const shown = page.getByTestId('review-title');
		const edit = page.getByTestId('review-edit-title');
		const input = page.getByTestId('review-title-input');

		await bytesWithTitle(
			page,
			chain,
			multisig.address,
			'First title',
		);
		await reviewBytes(page);
		await expectSimulation(page, 'success');

		await edit.click();
		await input.fill('');
		await input.press('Enter');
		await expect(shown).toHaveText('No title');
		await expect(
			page.getByTestId('review-submit'),
		).toBeEnabled();

		await edit.click();
		await expect(input).toHaveValue('');
		await input.fill('Second title');
		await input.press('Enter');
		await expect(shown).toHaveText('Second title');

		// Back on Details, the edited title is the field's.
		await page.getByTestId('review-back').click();
		await expect(
			page.getByTestId('proposal-title-input'),
		).toHaveValue('Second title');
		await reviewBytes(page);
		await proposeAndSign(page);
		expect(
			creates.map((r) => r.postDataJSON().description),
		).toEqual(['Second title']);
	});

	test('a 501-character title typed on Review blocks Propose and shows the count', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;

		await bytesWithTitle(
			page,
			chain,
			multisig.address,
			'Short',
		);
		await reviewBytes(page);
		await expectSimulation(page, 'success');
		await page.getByTestId('review-edit-title').click();
		const input = page.getByTestId('review-title-input');
		await input.fill('a'.repeat(501));
		await expect(input).toHaveAttribute(
			'aria-invalid',
			'true',
		);
		await input.press('Enter');
		await expect(
			page.getByTestId('review-step'),
		).toContainText(
			'501 of 500 characters. Use 500 or fewer.',
		);
		await expect(
			page.getByTestId('review-submit'),
		).toBeDisabled();
	});
});

test.describe('new proposal edges: submitting', () => {
	async function toReview(
		page: Page,
		chain: Chain,
		address: string,
	) {
		await openNewProposal(page, address, {
			type: 'bytes',
		});
		await pasteBytes(
			page,
			await suiTransferBytes(chain, address),
			'Once only',
		);
		await reviewBytes(page);
		await expectSimulation(page, 'success');
	}

	// BUG: Propose is only disabled once React re-renders with the
	// mutation pending, and submit() doesn't guard on a create in flight
	// (NewProposalPage.tsx:193), so a second click before that re-render
	// starts a second create. The first creates the proposal; the second
	// signs again and the API refuses it ("A proposal with the same digest
	// already exists."). useMutation only runs the latest mutate's
	// callbacks, so the user stays on Review with that refusal and "Try
	// again", although the proposal exists. Expected: one POST, then the
	// proposals.
	test('two clicks on Propose in the same tick send one POST /proposals', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const creates = recordCreates(page);
		await toReview(page, chain, multisig.address);

		await page
			.getByTestId('review-submit')
			.evaluate((button: HTMLButtonElement) => {
				button.click();
				button.click();
			});
		await expect
			.poll(() => creates.length)
			.toBeGreaterThan(0);
		// Let a second create, if any, reach the network.
		await page.waitForTimeout(2_000);
		expect(creates).toHaveLength(1);
		await expectOnProposals(page);
	});

	// BUG: same as above, with a real double click: Playwright's dblclick
	// sends two POSTs too, and Review shows "A proposal with the same digest
	// already exists." for a proposal that was created.

	test('a double click on Propose sends one POST /proposals', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const creates = recordCreates(page);
		await toReview(page, chain, multisig.address);

		await page.getByTestId('review-submit').dblclick();
		await expect
			.poll(() => creates.length)
			.toBeGreaterThan(0);
		await page.waitForTimeout(2_000);
		expect(creates).toHaveLength(1);
		await expectOnProposals(page);
		await expect(
			page.getByTestId('proposal-card'),
		).toHaveCount(1);
	});

	// BUG: the title's pen stays enabled while creating: `disabled` on
	// Base UI's TooltipTrigger disables the tooltip, not the button
	// (ReviewStep.tsx:314). A click opens the editor mid-create, and an
	// edit made there is silently not part of the proposal (the title was
	// read when Propose was clicked). Expected the pen disabled.
	test('while the proposal is being created, Back, Cancel, the stepper and the title are disabled', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		await toReview(page, chain, multisig.address);

		// Hold the create until the checks are done.
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route(
			(url) => url.pathname.endsWith('/proposals'),
			async (route) => {
				if (isCreateRequest(route.request())) await held;
				await route.fallback();
			},
		);

		const submit = page.getByTestId('review-submit');
		await submit.click();
		await expect(submit).toHaveText('Creating proposal…');
		await expect(submit).toBeDisabled();
		for (const id of [
			'review-back',
			'new-proposal-cancel',
			'new-proposal-cancel-footer',
			'new-proposal-step-1',
			'new-proposal-step-2',
		])
			await expect(page.getByTestId(id)).toBeDisabled();
		await expect
			.soft(page.getByTestId('review-edit-title'))
			.toBeDisabled();
		// A forced click on Back doesn't leave Review either.
		await page
			.getByTestId('review-back')
			.click({ force: true });
		await expect(
			page.getByTestId('review-step'),
		).toBeVisible();

		release();
		await expectOnProposals(page);
		await expect(
			toast(page, 'success').filter({
				hasText: 'Proposal created',
			}),
		).toBeVisible();
	});

	test('a second proposal reusing a pending proposal’s coins shows the API’s reason on Review', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		await proposeTransfer(chain, alice, {
			multisigAddress: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
		});
		const coinIds = (
			await chain.coins(multisig.address)
		).map((c) => c.objectId);

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await chooseAsset(page, SUI_TYPE);
		await page.getByTestId('transfer-max-button').click();
		const recipient = page.getByTestId(
			'transfer-recipient-input',
		);
		await recipient.fill(randomAddress());
		await recipient.blur();
		await reviewTransfer(page);
		await expectSimulation(page, 'success');
		await page.getByTestId('review-submit').click();

		const error = page.getByTestId('review-create-error');
		await expect(error).toHaveText(
			/^These owned\/receiving objects are already used by pending proposals: 0x[0-9a-f]{64}(, 0x[0-9a-f]{64})*$/,
		);
		const listed = (await error.textContent())!
			.split(': ')[1]
			.split(', ');
		for (const id of listed) expect(coinIds).toContain(id);
		await expect(
			page.getByTestId('review-submit'),
		).toHaveText('Try again');
		await expect(
			page.getByTestId('review-step'),
		).toBeVisible();
	});

	test('a declined signature shows the toast, keeps Review without a notice and sends nothing', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const creates = recordCreates(page);
		await toReview(page, chain, multisig.address);

		// The test wallet approves everything and has no setting to decline.
		// The app reads the wallet's features on every call, so replace its
		// signTransaction with one that rejects, as a wallet does when the
		// user declines.
		await page.evaluate(() => {
			const wallet = window.__e2eWallet!;
			const base = Object.getOwnPropertyDescriptor(
				Object.getPrototypeOf(wallet),
				'features',
			)!.get!;
			Object.defineProperty(wallet, 'features', {
				configurable: true,
				get() {
					const features = base.call(wallet);
					return {
						...features,
						'sui:signTransaction': {
							...features['sui:signTransaction'],
							signTransaction: () =>
								Promise.reject(
									new Error('User rejected the request'),
								),
						},
					};
				},
			});
		});

		const submit = page.getByTestId('review-submit');
		await submit.click();
		await expect(
			toast(page, 'error').filter({
				hasText:
					'The wallet didn’t sign the proposal. Nothing was created.',
			}),
		).toBeVisible();
		await expect(
			page.getByTestId('review-step'),
		).toBeVisible();
		await expect(
			page.getByTestId('review-create-error'),
		).toHaveCount(0);
		await expect(submit).toHaveText('Propose and sign');
		await expect(submit).toBeEnabled();
		expect(creates).toHaveLength(0);
	});
});

test.describe('new proposal edges: bytes', () => {
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
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const bytes = await suiTransferBytes(
			chain,
			multisig.address,
			{ Epoch: epoch - 1 },
		);

		await openNewProposal(page, multisig.address, {
			type: 'bytes',
		});
		await pasteBytes(page, bytes, 'Expired');
		await reviewBytes(page);
		await expect(
			page
				.getByTestId('review-expiry')
				.getByTestId('proposal-expiry'),
		).toHaveText('Expired');
		await expectSimulation(page, 'failure');
	});

	test('bytes expiring at the end of the current epoch show the expiry and simulate', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const bytes = await suiTransferBytes(
			chain,
			multisig.address,
			{ Epoch: await chain.epoch() },
		);

		await openNewProposal(page, multisig.address, {
			type: 'bytes',
		});
		await pasteBytes(page, bytes, 'This epoch only');
		await reviewBytes(page);
		await expect(
			page
				.getByTestId('review-expiry')
				.getByTestId('proposal-expiry'),
		).toHaveText(/^Expires in /);
		await expectSimulation(page, 'success');
		await proposeAndSign(page);
	});

	// Bytes built for another network: the sender is the account, but the
	// gas coin doesn't exist here.
	// BUG: (rough edge) the reason is the node's text as it is, "Error
	// checking transaction input objects: Could not find the referenced
	// object 0x… at version None." (ReviewStep.tsx:78): readable, but
	// "version None" is a Rust Option leaking through, and nothing hints
	// that the bytes may be for another network.
	test('bytes paying gas with a coin that doesn’t exist fail the simulation with a readable reason', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const tx = new Transaction();
		tx.setSender(multisig.address);
		tx.setGasPayment([
			{
				objectId: randomAddress(),
				version: '7',
				digest: toBase58(new Uint8Array(32).fill(7)),
			},
		]);
		tx.setGasPrice(1_000n);
		tx.setGasBudget(10_000_000n);
		const [coin] = tx.splitCoins(tx.gas, [1n]);
		tx.transferObjects([coin], randomAddress());
		const bytes = toBase64(await tx.build());

		await openNewProposal(page, multisig.address, {
			type: 'bytes',
		});
		await pasteBytes(page, bytes, 'Another network');
		await expect(
			page.getByTestId('bytes-status'),
		).toHaveAttribute('data-state', 'ok');
		await reviewBytes(page);
		await expectSimulation(page, 'failure');
		const notice = page.getByTestId(
			'review-simulation-error',
		);
		// Readable, if raw: "Error checking transaction input objects:
		// Could not find the referenced object 0x… at version None."
		await expect(notice).toHaveText(
			/^Simulation failed: .*Could not find the referenced object 0x[0-9a-f]{64}/,
		);
		const submit = page.getByTestId('review-submit');
		await expect(submit).toHaveText(
			'Propose and sign anyway',
		);
		// Proposing anyway: the API refuses it with its own reason.
		await submit.click();
		await expect(
			page.getByTestId('review-create-error'),
		).toHaveText(
			/^Object 0x[0-9a-f]{64} does not exist or has been deleted\.$/,
		);
	});

	test('bytes pasted with surrounding whitespace and newlines are read and proposed trimmed', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const creates = recordCreates(page);
		const bytes = await suiTransferBytes(
			chain,
			multisig.address,
		);

		await openNewProposal(page, multisig.address, {
			type: 'bytes',
		});
		await pasteBytes(
			page,
			`\n\n  \t${bytes} \n\n`,
			'Trimmed bytes',
		);
		await expect(
			page.getByTestId('bytes-status'),
		).toHaveAttribute('data-state', 'ok');
		await reviewBytes(page);
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

	test('bytes wrapped across lines are read as one transaction', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		const bytes = await suiTransferBytes(
			chain,
			multisig.address,
		);
		const wrapped = bytes.match(/.{1,76}/g)!.join('\n');

		await openNewProposal(page, multisig.address, {
			type: 'bytes',
		});
		await pasteBytes(page, wrapped, 'Wrapped');
		await expect(
			page.getByTestId('bytes-status'),
		).toHaveAttribute('data-state', 'ok');
		await reviewBytes(page);
		await expectSimulation(page, 'success');
		await proposeAndSign(page);
		await expect(
			page.getByTestId('proposal-card'),
		).toHaveCount(1);
	});
});

test.describe('new proposal edges: keyboard', () => {
	// The test ids of the next `count` elements `key` focuses.
	async function tabOrder(
		page: Page,
		count: number,
		key: 'Tab' | 'Shift+Tab' = 'Tab',
	): Promise<string[]> {
		const order: string[] = [];
		for (let i = 0; i < count; i++) {
			await page.keyboard.press(key);
			order.push(
				await page.evaluate(
					() =>
						document.activeElement?.getAttribute(
							'data-testid',
						) ??
						document.activeElement?.tagName ??
						'',
				),
			);
		}
		return order;
	}

	// BUG: (rough edge) Enter on a focused type card does nothing. The
	// cards are Base UI radios (buttons), not inputs, so the form's
	// implicit submission doesn't happen (TypeStep.tsx:66); a keyboard
	// user has to Tab to Continue. Expected Enter to continue, as it would
	// on a native radio in a form.
	test('Tab goes from the chosen type card to Continue, arrows change the type, and Enter continues', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		await openNewProposal(page, multisig.address);
		const transfer = page.getByTestId(
			'proposal-type-transfer',
		);
		await transfer.focus();

		// The radio group is one stop: Tab leaves the chosen card for
		// Continue (the footer's Cancel is for phones only), and Shift+Tab
		// goes back through the stepper's Details to the header's Cancel.
		expect(await tabOrder(page, 1)).toEqual([
			'type-continue',
		]);
		await transfer.focus();
		expect(await tabOrder(page, 2, 'Shift+Tab')).toEqual([
			'new-proposal-step-2',
			'new-proposal-cancel',
		]);

		await transfer.focus();
		await page.keyboard.press('ArrowDown');
		const bytes = page.getByTestId('proposal-type-bytes');
		await expect(bytes).toBeFocused();
		await expect(bytes).toHaveAttribute('data-checked');
		await page.keyboard.press('Enter');
		const bytesStep = page.getByTestId('bytes-step');
		await expect.soft(bytesStep).toBeVisible();
		if (!(await bytesStep.isVisible())) {
			// Continue from the keyboard instead.
			await page.keyboard.press('Tab');
			await expect(
				page.getByTestId('type-continue'),
			).toBeFocused();
			await page.keyboard.press('Enter');
			await expect(bytesStep).toBeVisible();
		}
		// The new step's heading takes focus.
		await expect(
			page.getByTestId('bytes-step').locator('h2'),
		).toBeFocused();
	});

	test('Escape in the Review title editor keeps the title, and the stepper’s earlier steps are reachable by keyboard', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await account({
			createActor,
			createIdentity,
			chain,
		});
		const { page } = alice;
		await openNewProposal(page, multisig.address, {
			type: 'bytes',
		});
		await pasteBytes(
			page,
			await suiTransferBytes(chain, multisig.address),
			'Keep me',
		);
		await reviewBytes(page);
		await expectSimulation(page, 'success');

		const edit = page.getByTestId('review-edit-title');
		await edit.focus();
		await page.keyboard.press('Enter');
		const input = page.getByTestId('review-title-input');
		await expect(input).toBeFocused();
		await page.keyboard.type(' and not this');
		await page.keyboard.press('Escape');
		await expect(input).toHaveCount(0);
		await expect(
			page.getByTestId('review-title'),
		).toHaveText('Keep me');
		await expect(
			page.getByTestId('review-step'),
		).toBeVisible();

		// The stepper's Type and Details are buttons Tab reaches.
		for (const n of [1, 2])
			await expect(
				page.getByTestId(`new-proposal-step-${n}`),
			).toBeEnabled();
		await page.getByTestId('new-proposal-step-2').focus();
		await page.keyboard.press('Enter');
		await expect(
			page.getByTestId('bytes-step'),
		).toBeVisible();
		await expect(
			page.getByTestId('bytes-input'),
		).not.toHaveValue('');
	});
});
