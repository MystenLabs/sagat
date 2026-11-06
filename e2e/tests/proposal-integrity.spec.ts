// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type PublicProposal } from '@mysten/sagat';
import { TransactionDataBuilder } from '@mysten/sui/transactions';
import {
	fromBase64,
	MIST_PER_SUI,
	toBase58,
} from '@mysten/sui/utils';

import { randomAddress } from '../support/chain';
import {
	expect,
	test,
	type Fixtures,
} from '../support/fixtures';
import {
	proposeTransfer,
	setupMultisig,
} from '../support/scenarios';

type Rule = 'sender' | 'digest' | 'signers';

/**
 * Alice proposes a transfer from her 2-of-2 account with Bob, and Bob
 * opens it with the proposal response changed by `tamper`. Returns the
 * vote requests the page sends, which should stay empty.
 */
async function openTamperedProposal(
	{ createActor, createIdentity, chain }: Fixtures,
	tamper: (context: {
		proposal: PublicProposal;
		bob: { address: string; publicKey: string };
	}) => Promise<PublicProposal> | PublicProposal,
) {
	const alice = createIdentity('alice');
	const bob = await createActor('bob');
	const multisig = await setupMultisig({
		creator: alice,
		members: [bob],
		threshold: 2,
	});
	await chain.fund(multisig.address);
	const proposed = await proposeTransfer(chain, alice, {
		multisigAddress: multisig.address,
		recipient: randomAddress(),
		amount: MIST_PER_SUI,
	});

	// Tampered once, so the page's refetches get the same proposal.
	let tampered: Promise<PublicProposal> | undefined;
	await bob.page.route(
		'**/proposals/digest/*',
		async (route) => {
			const response = await route.fetch();
			const proposal =
				(await response.json()) as PublicProposal;
			tampered ??= Promise.resolve(
				tamper({ proposal, bob }),
			);
			await route.fulfill({
				response,
				json: await tampered,
			});
		},
	);
	const votes: string[] = [];
	bob.page.on('request', (request) => {
		if (
			request.method() === 'POST' &&
			/\/proposals\/\d+\/vote$/.test(
				new URL(request.url()).pathname,
			)
		)
			votes.push(request.url());
	});

	await bob.signIn();
	await bob.page.goto(
		`/multisig/${multisig.address}/proposals/${proposed.digest}`,
	);
	return { bob, votes };
}

async function expectRefused(
	{
		bob,
		votes,
	}: Awaited<ReturnType<typeof openTamperedProposal>>,
	rule: Rule,
) {
	const card = bob.page.getByTestId('approvals-card');
	const refusal = card.getByTestId('sign-refused');
	await expect(refusal).toBeVisible();
	await expect(refusal).toHaveAttribute('data-rule', rule);
	await expect(
		card.getByTestId('sign-proposal-button'),
	).toHaveCount(0);
	expect(votes).toEqual([]);
}

test.describe('proposal integrity', () => {
	test("refuses to sign bytes whose sender is the signer's own address", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const opened = await openTamperedProposal(
			{ createActor, createIdentity, chain },
			async ({ proposal, bob }) => {
				// A transfer from Bob's own address, which his signature alone
				// would execute, with the digest that matches it.
				await chain.fund(bob.address);
				const transactionBytes =
					await chain.buildSuiTransfer({
						sender: bob.address,
						recipient: randomAddress(),
						amount: MIST_PER_SUI,
					});
				return {
					...proposal,
					transactionBytes,
					digest: TransactionDataBuilder.getDigestFromBytes(
						fromBase64(transactionBytes),
					),
				};
			},
		);
		await expectRefused(opened, 'sender');
	});

	test("refuses to sign bytes that don't match the proposal's digest", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const opened = await openTamperedProposal(
			{ createActor, createIdentity, chain },
			({ proposal }) => ({
				...proposal,
				digest: toBase58(
					crypto.getRandomValues(new Uint8Array(32)),
				),
			}),
		);
		await expectRefused(opened, 'digest');
	});

	test("refuses to sign when the signers don't make up the account's address", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const opened = await openTamperedProposal(
			{ createActor, createIdentity, chain },
			({ proposal, bob }) => ({
				...proposal,
				multisig: {
					...proposal.multisig,
					members: proposal.multisig.members.map((m) =>
						m.publicKey === bob.publicKey
							? { ...m, weight: 2 }
							: m,
					),
				},
			}),
		);
		await expectRefused(opened, 'signers');
	});
});
