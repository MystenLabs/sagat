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
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';

import { newProposalPath } from '../../app/src/lib/new-proposal';
import { type Actor } from '../support/actor';
import { randomAddress } from '../support/chain';
import { E2E } from '../support/env';
import {
	expect,
	test,
	type Fixtures,
} from '../support/fixtures';
import {
	isVoteRequest,
	recordCreates,
	recordVotes,
	sharedAccount,
} from '../support/new-proposal';
import {
	addProposer,
	proposeTransfer,
	setupMultisig,
	setupProposal,
} from '../support/scenarios';

type Rule =
	'sender' | 'gasOwner' | 'digest' | 'signers' | 'proposer';

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

type Tamper = (context: {
	proposal: PublicProposal;
	bob: Actor;
}) => Promise<PublicProposal> | PublicProposal;

/** Serves Bob the proposal response changed by `tamper`. */
async function routeTampered(bob: Actor, tamper: Tamper) {
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
}

/** Bob opens a transfer from an external proposer, with the response changed by `tamper`. */
async function openExternalProposal(
	{ createActor, createIdentity, chain }: Fixtures,
	tamper: Tamper,
) {
	const alice = createIdentity('alice');
	const bob = await createActor('bob');
	const payments = createIdentity('payments');
	const multisig = await setupMultisig({
		creator: alice,
		members: [bob],
		threshold: 2,
	});
	await addProposer(
		alice,
		multisig.address,
		payments.address,
	);
	await chain.fund(multisig.address);
	const proposal = await proposeTransfer(chain, payments, {
		multisigAddress: multisig.address,
		recipient: randomAddress(),
		amount: MIST_PER_SUI,
	});

	await routeTampered(bob, tamper);
	const votes = recordVotes(bob.page);
	await bob.signIn();
	await bob.page.goto(
		`/multisig/${multisig.address}/proposals/${proposal.digest}`,
	);
	return { bob, votes };
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
	tamper: Tamper,
	{ shared = false }: { shared?: boolean } = {},
) {
	const {
		bob,
		multisig,
		proposal: proposed,
	} = await setupProposal(fixtures);

	await routeTampered(bob, tamper);
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

	test('signs a confirmed external proposer’s proposal without a warning', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { bob } = await openExternalProposal(
			{ createActor, createIdentity, chain },
			({ proposal }) => proposal,
		);
		const card = bob.page.getByTestId('approvals-card');
		const sign = card.getByTestId('sign-proposal-button');
		// Enabled once the proposer check has resolved.
		await expect(sign).toBeEnabled();
		await expect(
			card.getByTestId('proposer-unconfirmed'),
		).toHaveCount(0);
		await expect(
			card.getByTestId('sign-refused'),
		).toHaveCount(0);
		const voted = bob.page.waitForResponse((response) =>
			isVoteRequest(response.request()),
		);
		await sign.click();
		expect((await voted).ok()).toBe(true);
	});

	test('warns about an external proposer no signer has confirmed, and still signs', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		// As for a proposer added before events were kept.
		const { bob } = await openExternalProposal(
			{ createActor, createIdentity, chain },
			({ proposal }) => ({
				...proposal,
				events: {
					created: proposal.events?.created ?? null,
					proposer: null,
				},
			}),
		);
		const card = bob.page.getByTestId('approvals-card');
		await expect(
			card.getByTestId('proposer-unconfirmed'),
		).toBeVisible();
		// Refetches serve the tampered proposal again, so check the vote itself.
		const voted = bob.page.waitForResponse((response) =>
			isVoteRequest(response.request()),
		);
		await card.getByTestId('sign-proposal-button').click();
		expect((await voted).ok()).toBe(true);
	});

	test("refuses to sign when the proposal wasn't signed by its external proposer", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const opened = await openExternalProposal(
			{ createActor, createIdentity, chain },
			// Bob's signature over the bytes in place of the proposer's.
			async ({ proposal, bob }) => {
				const created = proposal.events!.created!;
				return {
					...proposal,
					events: {
						...proposal.events!,
						created: {
							...created,
							proof: {
								...created.proof,
								signature: await bob.signTransaction(
									proposal.transactionBytes,
								),
							},
						},
					},
				};
			},
		);
		await expectRefused(opened, 'proposer');
	});

	test('refuses to sign an external proposal relabelled as a member’s', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const opened = await openExternalProposal(
			{ createActor, createIdentity, chain },
			// Alice named as the proposer, with the external proposer's created event.
			({ proposal, bob }) => ({
				...proposal,
				proposerAddress: publicKeyFromSuiBytes(
					proposal.multisig.members.find(
						(m) => m.publicKey !== bob.publicKey,
					)!.publicKey,
				).toSuiAddress(),
			}),
		);
		await expectRefused(opened, 'proposer');
	});

	test('warns about a proposal relabelled as a member’s with no signature of theirs, and still signs', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { bob } = await openExternalProposal(
			{ createActor, createIdentity, chain },
			// Alice named as the proposer, with neither her created event nor her vote.
			({ proposal, bob }) => {
				const alice = proposal.multisig.members.find(
					(m) => m.publicKey !== bob.publicKey,
				)!.publicKey;
				return {
					...proposal,
					proposerAddress:
						publicKeyFromSuiBytes(alice).toSuiAddress(),
					signatures: proposal.signatures.filter(
						(s) => s.publicKey !== alice,
					),
					events: {
						created: null,
						proposer: proposal.events?.proposer ?? null,
					},
				};
			},
		);
		const card = bob.page.getByTestId('approvals-card');
		await expect(
			card.getByTestId('proposer-unconfirmed'),
		).toBeVisible();
		const voted = bob.page.waitForResponse((response) =>
			isVoteRequest(response.request()),
		);
		await card.getByTestId('sign-proposal-button').click();
		expect((await voted).ok()).toBe(true);
	});

	test('shows no warning on a member’s own proposal', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { bob } = await openTamperedProposal(
			{ createActor, createIdentity, chain },
			({ proposal }) => proposal,
		);
		const card = bob.page.getByTestId('approvals-card');
		const sign = card.getByTestId('sign-proposal-button');
		// Enabled once the proposer check has resolved.
		await expect(sign).toBeEnabled();
		await expect(
			card.getByTestId('proposer-unconfirmed'),
		).toHaveCount(0);
		await expect(
			card.getByTestId('sign-refused'),
		).toHaveCount(0);
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
