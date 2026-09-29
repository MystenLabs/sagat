// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';
import { MIST_PER_SUI, toBase64 } from '@mysten/sui/utils';

import {
	randomAddress,
	type Chain,
} from '../support/chain';
import { expect, test } from '../support/fixtures';
import {
	proposeTransfer,
	setupMultisig,
	signProposal,
} from '../support/scenarios';

test.describe('proposals', () => {
	test('members propose, co-sign and execute a SUI transfer', async ({
		createActor,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = await createActor('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
		});
		await chain.fund(multisig.address);
		const recipient = randomAddress();

		// Alice proposes a transfer from the Balances tab.
		await alice.signIn();
		await alice.page
			.getByTestId('multisig-tab-assets')
			.click();
		await alice
			.suiBalanceRow()
			.getByTestId('asset-send-button')
			.click();
		const sheet = alice.page.getByTestId('proposal-sheet');
		await sheet
			.getByTestId('transfer-recipient-input')
			.fill(recipient);
		await sheet
			.getByTestId('transfer-amount-input')
			.fill('1.5');
		await sheet
			.getByTestId('transfer-preview-button')
			.click();
		await expect(
			sheet.getByTestId('transaction-preview-result'),
		).toHaveAttribute('data-result', 'success');
		await sheet
			.getByTestId('proposal-description-input')
			.fill('Pay 1.5 SUI');
		await sheet
			.getByTestId('create-proposal-submit')
			.click();
		await expect(sheet).toBeHidden();

		// Proposing counts as Alice's signature.
		await alice.page
			.getByTestId('multisig-tab-proposals')
			.click();
		const aliceCard =
			alice.page.getByTestId('proposal-card');
		await expect(aliceCard).toHaveAttribute(
			'data-status',
			'pending',
		);
		await expect(
			aliceCard.getByTestId('proposal-signature-weight'),
		).toHaveAttribute('data-current-weight', '1');
		await expect(
			aliceCard.getByTestId('proposal-already-signed'),
		).toBeVisible();
		const digest =
			await aliceCard.getAttribute('data-digest');
		expect(digest).toBeTruthy();

		// Bob co-signs, which makes it executable, then executes it.
		await bob.signIn();
		const bobCard = bob.proposalCard(digest!);
		await bobCard
			.getByTestId('proposal-toggle-details')
			.click();
		await bobCard
			.getByTestId('sign-proposal-button')
			.click();
		await expect(bobCard).toHaveAttribute(
			'data-status',
			'ready',
		);
		await bobCard
			.getByTestId('execute-proposal-button')
			.click();
		await expect(bobCard).toHaveAttribute(
			'data-status',
			'executed',
		);

		// The transfer really happened on-chain.
		expect(await chain.balance(recipient)).toBe(
			(3n * MIST_PER_SUI) / 2n,
		);

		// Alice sees the outcome too.
		await alice.page.reload();
		await expect(
			alice.proposalCard(digest!),
		).toHaveAttribute('data-status', 'executed');
	});

	test('a member cancels a pending proposal', async ({
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
		const proposal = await proposeTransfer(chain, alice, {
			multisigAddress: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
			description: 'Cancel me',
		});

		await bob.signIn();
		const card = bob.proposalCard(proposal.digest);
		await expect(card).toHaveAttribute(
			'data-status',
			'pending',
		);
		await card
			.getByTestId('cancel-proposal-button')
			.click();
		await bob.page
			.getByTestId('confirm-cancel-proposal-button')
			.click();

		await expect(card).toHaveAttribute(
			'data-status',
			'cancelled',
		);
		await expect(
			card.getByTestId('execute-proposal-button'),
		).toHaveCount(0);
	});

	test('proposes a custom transaction from raw bytes', async ({
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
		const bytes = await chain.buildSuiTransfer({
			sender: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI / 4n,
		});

		await alice.signIn();
		await alice.page
			.getByTestId('new-proposal-button')
			.click();
		const sheet = alice.page.getByTestId('proposal-sheet');
		await sheet
			.getByTestId('custom-transaction-input')
			.fill(bytes);
		await sheet
			.getByTestId('custom-preview-button')
			.click();
		await expect(
			sheet.getByTestId('transaction-preview-result'),
		).toHaveAttribute('data-result', 'success');
		await sheet
			.getByTestId('create-proposal-submit')
			.click();
		await expect(sheet).toBeHidden();

		const card = alice.page.getByTestId('proposal-card');
		await expect(card).toHaveAttribute(
			'data-status',
			'pending',
		);
		const digest = await card.getAttribute('data-digest');

		// Bob signs from the API; Alice's view picks it up on refresh.
		const proposal = await bob.api.getProposalByDigest(
			digest!,
		);
		await signProposal(bob, proposal);
		await alice.page
			.getByTestId('refresh-proposals-button')
			.click();
		await expect(card).toHaveAttribute(
			'data-status',
			'ready',
		);
	});

	test('refuses to propose a transaction that would fail on-chain', async ({
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
		await alice.page
			.getByTestId('new-proposal-button')
			.click();
		const sheet = alice.page.getByTestId('proposal-sheet');
		await sheet
			.getByTestId('custom-transaction-input')
			.fill(await buildOverdraft(chain, multisig.address));
		await sheet
			.getByTestId('custom-preview-button')
			.click();

		await expect(
			sheet.getByTestId('transaction-preview-result'),
		).toHaveAttribute('data-result', 'failure');
		await expect(
			sheet.getByTestId('create-proposal-submit'),
		).toHaveCount(0);
	});
});

// Spends far more than the 1,000 SUI the faucet sent. Building with a client
// would simulate the transaction and reject it, so pin the gas coin, price
// and budget and build it offline instead.
async function buildOverdraft(
	chain: Chain,
	sender: string,
) {
	const [{ objects: coins }, { referenceGasPrice }] =
		await Promise.all([
			chain.client.listCoins({ owner: sender }),
			chain.client.getReferenceGasPrice(),
		]);
	const tx = new Transaction();
	tx.setSender(sender);
	tx.setGasPayment(
		coins.map(({ objectId, version, digest }) => ({
			objectId,
			version,
			digest,
		})),
	);
	tx.setGasPrice(BigInt(referenceGasPrice));
	tx.setGasBudget(50_000_000n);
	const [coin] = tx.splitCoins(tx.gas, [
		100_000n * MIST_PER_SUI,
	]);
	tx.transferObjects([coin], randomAddress());
	return toBase64(await tx.build());
}
