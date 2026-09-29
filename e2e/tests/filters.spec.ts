// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MIST_PER_SUI } from '@mysten/sui/utils';
import { type Page } from '@playwright/test';

import {
	randomAddress,
	type GasCoin,
} from '../support/chain';
import { expect, test } from '../support/fixtures';
import { type Identity } from '../support/identity';
import {
	cancelProposal,
	executeOutsideApp,
	proposeTransfer,
	setupMultisig,
	signProposal,
} from '../support/scenarios';

test('proposal filters show each proposal where it belongs', async ({
	createActor,
	createIdentity,
	chain,
}) => {
	const alice = await createActor('alice');
	const bob = createIdentity('bob');
	const carol = createIdentity('carol');
	const multisig = await setupMultisig({
		creator: alice,
		members: [bob, carol],
		threshold: 2,
	});
	// One gas coin per proposal, so they can all be pending at once.
	const coins = await chain.fundWithCoins(
		multisig.address,
		{
			count: 5,
			amount: 10n * MIST_PER_SUI,
		},
	);
	const propose = (proposer: Identity, gasCoin: GasCoin) =>
		proposeTransfer(chain, proposer, {
			multisigAddress: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
			gasCoin,
		});

	// Needs Alice's signature.
	const needsAlice = await propose(bob, coins[0]);
	// Alice signed; waiting for the others.
	const waiting = await propose(alice, coins[1]);
	// Bob and Carol signed; ready to execute.
	const ready = await propose(bob, coins[2]);
	await signProposal(carol, ready);
	// Signed by Bob and Carol, executed on-chain, then verified with the API.
	const executed = await propose(bob, coins[3]);
	await signProposal(carol, executed);
	await executeOutsideApp(chain, {
		members: [
			{ identity: alice },
			{ identity: bob },
			{ identity: carol },
		],
		threshold: 2,
		signers: [bob, carol],
		transactionBytes: executed.transactionBytes,
	});
	await bob.api.verifyProposalByDigest(executed.digest);
	const cancelled = await propose(bob, coins[4]);
	await cancelProposal(bob, cancelled);

	await alice.signIn();
	await alice.page
		.getByTestId('multisig-tab-proposals')
		.click();

	const expected = {
		all: [needsAlice, waiting, ready, executed, cancelled],
		pending: [needsAlice],
		waiting: [waiting],
		ready: [ready],
		executed: [executed],
		cancelled: [cancelled],
	};
	for (const [filter, proposals] of Object.entries(
		expected,
	)) {
		await test.step(filter, async () => {
			await alice.page
				.getByTestId(`proposal-filter-${filter}`)
				.click();
			await expect
				.poll(() => shownDigests(alice.page))
				.toEqual(proposals.map((p) => p.digest).sort());
		});
	}
});

function shownDigests(page: Page) {
	return page
		.getByTestId('proposal-card')
		.evaluateAll((cards) =>
			cards
				.map((card) => card.getAttribute('data-digest'))
				.sort(),
		);
}
