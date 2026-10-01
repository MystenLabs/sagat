// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MIST_PER_SUI, toBase58 } from '@mysten/sui/utils';

import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';
import {
	executeOutsideApp,
	proposeTransfer,
	setupMultisig,
} from '../support/scenarios';

test.describe('errors', () => {
	test('shows why a proposal failed to execute', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		// 1-of-2, so Bob's proposal is ready to execute right away.
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 1,
		});
		await chain.fund(multisig.address);
		const proposal = await proposeTransfer(chain, bob, {
			multisigAddress: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
		});

		// Another transaction spends the multisig's gas coin first, outside
		// the app, so the proposal's transaction is no longer valid.
		await executeOutsideApp(chain, {
			members: [{ identity: alice }, { identity: bob }],
			threshold: 1,
			signers: [bob],
			transactionBytes: await chain.buildSuiTransfer({
				sender: multisig.address,
				recipient: randomAddress(),
				amount: MIST_PER_SUI,
			}),
		});

		await alice.signIn();
		const card = alice.proposalCard(proposal.digest);
		await expect(card).toHaveAttribute(
			'data-status',
			'ready',
		);
		await card
			.getByTestId('execute-proposal-button')
			.click();

		await expect(
			card.getByTestId('proposal-execute-error'),
		).toBeVisible();
		// TODO: it can never execute now, so it should move to a new terminal
		// status (see lookupAndVerifyProposal in the API) instead of staying
		// ready.
		await expect(card).toHaveAttribute(
			'data-status',
			'ready',
		);
	});

	test('a link to an unknown proposal shows an error', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');
		const unknownDigest = toBase58(
			crypto.getRandomValues(new Uint8Array(32)),
		);

		await alice.page.goto(
			`/proposals?digest=${unknownDigest}`,
		);
		await alice.connectWallet();

		await expect(
			alice.page.getByTestId('proposal-detail-error'),
		).toBeVisible();
	});
});
