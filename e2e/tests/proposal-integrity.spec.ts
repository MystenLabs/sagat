// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	type MultisigWithMembers,
	type PublicProposal,
} from '@mysten/sagat';
import {
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import {
	fromBase64,
	MIST_PER_SUI,
	toBase64,
} from '@mysten/sui/utils';

import { newProposalPath } from '../../app/src/lib/new-proposal';
import { randomAddress } from '../support/chain';
import { E2E } from '../support/env';
import {
	expect,
	test,
	type Fixtures,
} from '../support/fixtures';
import {
	recordCreates,
	recordVotes,
	sharedAccount,
} from '../support/new-proposal';
import { setupProposal } from '../support/scenarios';

type Rule = 'sender' | 'gasOwner' | 'digest' | 'signers';

/** The proposal with other bytes, and the digest that matches them. */
function withBytes(
	proposal: PublicProposal,
	transactionBytes: string,
): PublicProposal {
	return {
		...proposal,
		transactionBytes,
		digest: TransactionDataBuilder.getDigestFromBytes(
			fromBase64(transactionBytes),
		),
	};
}

/**
 * Alice proposes a transfer from her 2-of-2 account with Bob, and Bob
 * opens it with the proposal response changed by `tamper`: signed in,
 * under the account, or with `shared`, at the shared link with his
 * wallet connected but not signed in. Returns the vote requests the page
 * sends, which should stay empty.
 */
async function openTamperedProposal(
	fixtures: Fixtures,
	tamper: (context: {
		proposal: PublicProposal;
		bob: { address: string; publicKey: string };
	}) => Promise<PublicProposal> | PublicProposal,
	{ shared = false }: { shared?: boolean } = {},
) {
	const {
		bob,
		multisig,
		proposal: proposed,
	} = await setupProposal(fixtures);

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
	const votes = recordVotes(bob.page);

	if (shared) {
		await bob.page.goto(
			`/proposals?digest=${proposed.digest}`,
		);
		await bob.connectWallet({ signIn: false });
	} else {
		await bob.signIn();
		await bob.page.goto(
			`/multisig/${multisig.address}/proposals/${proposed.digest}`,
		);
	}
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
				return withBytes(
					proposal,
					await chain.buildSuiTransfer({
						sender: bob.address,
						recipient: randomAddress(),
						amount: MIST_PER_SUI,
					}),
				);
			},
		);
		await expectRefused(opened, 'sender');
	});

	test("refuses to sign bytes whose gas is paid by the signer's own address", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const opened = await openTamperedProposal(
			{ createActor, createIdentity, chain },
			async ({ proposal, bob }) => {
				// From the account, but with Bob's coins as gas and Bob as the
				// gas owner, so his signature would also sign as the sponsor.
				await chain.fund(bob.address);
				const tx = new Transaction();
				tx.setSender(proposal.multisigAddress);
				tx.setGasOwner(bob.address);
				tx.setGasPayment(await chain.coins(bob.address));
				const [coin] = tx.splitCoins(tx.gas, [
					MIST_PER_SUI,
				]);
				tx.transferObjects([coin], randomAddress());
				return withBytes(
					proposal,
					toBase64(
						await tx.build({ client: chain.client }),
					),
				);
			},
		);
		await expectRefused(opened, 'gasOwner');
	});

	test("refuses to sign bytes that don't match the proposal's digest", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const opened = await openTamperedProposal(
			{ createActor, createIdentity, chain },
			// Another proposal from the account, consistent in itself, in
			// answer to the digest Bob opened.
			async ({ proposal }) =>
				withBytes(
					proposal,
					await chain.buildSuiTransfer({
						sender: proposal.multisigAddress,
						recipient: randomAddress(),
						amount: 2n * MIST_PER_SUI,
					}),
				),
		);
		await expectRefused(opened, 'digest');
	});

	test("refuses to sign bytes from the shared link that don't match the link's digest", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const opened = await openTamperedProposal(
			{ createActor, createIdentity, chain },
			async ({ proposal }) =>
				withBytes(
					proposal,
					await chain.buildSuiTransfer({
						sender: proposal.multisigAddress,
						recipient: randomAddress(),
						amount: 2n * MIST_PER_SUI,
					}),
				),
			{ shared: true },
		);
		await expectRefused(opened, 'digest');
		await expect(opened.bob.page).toHaveURL(
			(url) => url.pathname === '/proposals',
		);
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

	test("refuses to propose when the signers don't make up the account's address", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, bob, multisig } = await sharedAccount(
			{ createActor, createIdentity, chain },
			2,
		);
		const tamper = (account: MultisigWithMembers) =>
			account.address === multisig.address
				? {
						...account,
						members: account.members.map((m) =>
							m.publicKey === bob.publicKey
								? { ...m, weight: 2 }
								: m,
						),
					}
				: account;
		// The wizard reads the signers from both the account list and the account.
		await alice.page.route(
			`${E2E.apiUrl}/addresses/connections`,
			async (route) => {
				const response = await route.fetch();
				const connections =
					(await response.json()) as Record<
						string,
						MultisigWithMembers[]
					>;
				await route.fulfill({
					response,
					json: Object.fromEntries(
						Object.entries(connections).map(
							([publicKey, accounts]) => [
								publicKey,
								accounts.map(tamper),
							],
						),
					),
				});
			},
		);
		await alice.page.route(
			`${E2E.apiUrl}/multisig/${multisig.address}`,
			async (route) => {
				const response = await route.fetch();
				await route.fulfill({
					response,
					json: tamper(
						(await response.json()) as MultisigWithMembers,
					),
				});
			},
		);
		const creates = recordCreates(alice.page);

		await alice.page.goto(
			newProposalPath(multisig.address),
		);
		const refusal = alice.page.getByTestId(
			'new-proposal-refused',
		);
		await expect(refusal).toBeVisible();
		await expect(refusal).toHaveAttribute(
			'data-rule',
			'signers',
		);
		await expect(
			alice.page.getByTestId('type-step'),
		).toHaveCount(0);
		await expect(
			alice.page.getByTestId('review-submit'),
		).toHaveCount(0);
		expect(creates).toEqual([]);
	});
});
