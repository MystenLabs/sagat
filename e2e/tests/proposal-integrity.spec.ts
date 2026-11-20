// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	deriveAliasesObjectId,
	type AuthCheckResponse,
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
	toBase58,
	toBase64,
} from '@mysten/sui/utils';
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';
import { type Page, type Route } from '@playwright/test';

import { docsUrl } from '../../app/src/lib/docs';
import { newProposalPath } from '../../app/src/lib/new-proposal';
import { type Actor } from '../support/actor';
import {
	randomAddress,
	type Chain,
} from '../support/chain';
import { E2E } from '../support/env';
import {
	expect,
	test,
	type Fixtures,
} from '../support/fixtures';
import { type Identity } from '../support/identity';
import {
	isVoteRequest,
	recordCreates,
	recordVotes,
	sharedAccount,
} from '../support/new-proposal';
import {
	addAlias,
	addProposer,
	proposeTransfer,
	replaceOwnAlias,
	setupMultisig,
	setupProposal,
} from '../support/scenarios';

type Rule =
	| 'sender'
	| 'gasOwner'
	| 'digest'
	| 'signers'
	| 'proposer'
	| 'notActing'
	| 'chain';

const BATCH_GET_OBJECTS =
	'**/sui.rpc.v2.LedgerService/BatchGetObjects';

/**
 * Aborts the page's node reads of `pod`'s alias set, leaving its other
 * object reads alone. Returns a function that stops aborting.
 */
async function failAliasReads(page: Page, pod: string) {
	const aliasObject = deriveAliasesObjectId(pod);
	const handler = (route: Route) =>
		Buffer.from(route.request().postData() ?? '', 'base64')
			.toString('latin1')
			.includes(aliasObject)
			? route.abort()
			: route.fallback();
	await page.route(BATCH_GET_OBJECTS, handler);
	return () => page.unroute(BATCH_GET_OBJECTS, handler);
}

/** Alice and Bob sign together for their 2-of-2 pod, outside the app. */
function bothSign(alice: Identity, bob: Identity) {
	return {
		members: [{ identity: alice }, { identity: bob }],
		threshold: 2,
		signers: [alice, bob],
	};
}

/**
 * Bytes of a SUI transfer from `sender` whose expiration names a chain
 * other than the local one, built offline: the node won't simulate them.
 */
async function buildForAnotherChain(
	chain: Chain,
	sender: string,
) {
	const [coins, { referenceGasPrice }] = await Promise.all([
		chain.coins(sender),
		chain.client.getReferenceGasPrice(),
	]);
	const tx = new Transaction();
	tx.setSender(sender);
	tx.setGasPayment(coins);
	tx.setGasPrice(BigInt(referenceGasPrice));
	tx.setGasBudget(10_000_000n);
	tx.setExpiration({
		ValidDuring: {
			minEpoch: null,
			maxEpoch: null,
			minTimestamp: null,
			maxTimestamp: null,
			chain: toBase58(
				crypto.getRandomValues(new Uint8Array(32)),
			),
			nonce: 0,
		},
	});
	const [coin] = tx.splitCoins(tx.gas, [MIST_PER_SUI]);
	tx.transferObjects([coin], randomAddress());
	return toBase64(await tx.build());
}

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
		await expect(
			card
				.getByTestId('proposer-unconfirmed')
				.getByTestId('learn-more-link'),
		).toHaveAttribute(
			'href',
			docsUrl(
				'/security/proposer-confirmations#confirmed-proposals',
			),
		);
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
		await expect(
			opened.bob.page
				.getByTestId('sign-refused')
				.getByTestId('learn-more-link'),
		).toHaveAttribute(
			'href',
			docsUrl(
				'/security/proposer-confirmations#confirmed-proposals',
			),
		);
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

	test("hides a pod whose address its signers don't make up", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig } = await sharedAccount(
			{ createActor, createIdentity, chain },
			2,
		);
		const listed = randomAddress();
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
								accounts.map((account) =>
									account.address === multisig.address
										? { ...account, address: listed }
										: account,
								),
							],
						),
					),
				});
			},
		);

		await alice.page.goto(`/multisig/${listed}/overview`);
		const refusal = alice.page.getByTestId('pod-refused');
		await expect(refusal).toBeVisible();
		await expect(refusal).toHaveAttribute(
			'data-rule',
			'signers',
		);
		await expect(
			alice.page.getByTestId('multisig-detail'),
		).toHaveCount(0);

		await alice.page.getByTestId('receive-button').click();
		const dialog = alice.page.getByTestId('receive-dialog');
		await expect(
			dialog.getByTestId('receive-refused'),
		).toBeVisible();
		for (const testId of [
			'receive-qr',
			'receive-address',
			'receive-copy',
		])
			await expect(dialog.getByTestId(testId)).toHaveCount(
				0,
			);
	});

	test("offers no accept for an invitation whose address its signers don't make up", async ({
		createActor,
		createIdentity,
	}) => {
		const alice = createIdentity('alice');
		const bob = await createActor('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
			accept: false,
		});
		const listed = randomAddress();
		await bob.page.route(
			`${E2E.apiUrl}/addresses/invitations/**`,
			async (route) => {
				const response = await route.fetch();
				const invitations =
					(await response.json()) as MultisigWithMembers[];
				await route.fulfill({
					response,
					json: invitations.map((account) =>
						account.address === multisig.address
							? { ...account, address: listed }
							: account,
					),
				});
			},
		);

		await bob.signIn();
		await bob.page.goto('/invitations');
		await bob.page
			.getByTestId('invitation-toggle-details')
			.click();
		const review = bob.page.getByTestId(
			'invitation-review',
		);
		const refusal = review.getByTestId(
			'invitation-refused',
		);
		await expect(refusal).toBeVisible();
		await expect(
			bob.page
				.getByTestId('invitation-card')
				.locator(`[data-address="${listed}"]`),
		).toHaveCount(0);
		await expect(refusal).toHaveAttribute(
			'data-rule',
			'signers',
		);
		await expect(
			review.getByTestId('accept-invitation-button'),
		).toHaveCount(0);
		await expect(
			review.getByTestId('reject-invitation-open'),
		).toBeVisible();
	});

	test("doesn't sign in with a key that isn't the wallet's", async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		await alice.signIn();
		await alice.page.route(
			`${E2E.apiUrl}/auth/check`,
			async (route) => {
				const response = await route.fetch();
				const auth =
					(await response.json()) as AuthCheckResponse;
				await route.fulfill({
					response,
					json: {
						...auth,
						addresses: auth.addresses.map((entry) =>
							entry.address === alice.address
								? { ...entry, publicKey: bob.publicKey }
								: entry,
						),
					},
				});
			},
		);

		await alice.page.reload();
		await expect(alice.walletMenuButton()).toHaveAttribute(
			'data-auth-state',
			'unauthenticated',
		);
		await expect(
			alice.page.getByTestId('sign-in-button'),
		).toBeVisible();
	});

	test("hides a pod's signers when its own response doesn't make up its address", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, bob, multisig } = await sharedAccount(
			{ createActor, createIdentity, chain },
			2,
			{ fund: false },
		);
		const carol = createIdentity('carol');
		// Only the pod's own response changes; the pod list stays honest.
		await alice.page.route(
			`${E2E.apiUrl}/multisig/${multisig.address}`,
			async (route) => {
				const response = await route.fetch();
				const account =
					(await response.json()) as MultisigWithMembers;
				await route.fulfill({
					response,
					json: {
						...account,
						members: account.members.map((m) =>
							m.publicKey === bob.publicKey
								? { ...m, publicKey: carol.publicKey }
								: m,
						),
					},
				});
			},
		);

		await alice.page.goto(
			`/multisig/${multisig.address}/signers`,
		);
		const refusal = alice.page.getByTestId(
			'signers-refused',
		);
		await expect(refusal).toBeVisible();
		await expect(refusal).toHaveAttribute(
			'data-rule',
			'signers',
		);
		await expect(
			alice.page.getByTestId('member-item'),
		).toHaveCount(0);
		await expect(
			alice.page.getByTestId('setup-download'),
		).toHaveCount(0);
	});

	test('refuses a pod whose alias set on chain no longer holds its own address', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, bob, multisig, proposal } =
			await setupProposal({
				createActor,
				createIdentity,
				chain,
			});
		await replaceOwnAlias(
			chain,
			bothSign(alice, bob),
			randomAddress(),
		);
		const votes = recordVotes(bob.page);
		await bob.signIn();

		await bob.page.goto(
			`/multisig/${multisig.address}/overview`,
		);
		const refusal = bob.page.getByTestId('pod-refused');
		await expect(refusal).toBeVisible();
		await expect(refusal).toHaveAttribute(
			'data-rule',
			'notActing',
		);
		await bob.page.getByTestId('receive-button').click();
		const dialog = bob.page.getByTestId('receive-dialog');
		await expect(
			dialog.getByTestId('receive-refused'),
		).toBeVisible();
		await expect(
			dialog.getByTestId('receive-address'),
		).toHaveCount(0);

		// Under the pod the refusal hides the proposal; the shared link shows Sign's place.
		await bob.page.goto(
			`/proposals?digest=${proposal.digest}`,
		);
		await expectRefused({ bob, votes }, 'notActing');
	});

	test("shows that the pod's signers couldn't be checked while the node can't be read, until a retry reads it", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { bob, multisig, proposal } = await setupProposal(
			{ createActor, createIdentity, chain },
		);
		const { page } = bob;
		const stopFailing = await failAliasReads(
			page,
			multisig.address,
		);
		const votes = recordVotes(page);
		await bob.signIn();

		await page.goto(
			`/multisig/${multisig.address}/proposals/${proposal.digest}`,
		);
		const card = page.getByTestId('approvals-card');
		await expect(
			card.getByTestId('sign-unchecked'),
		).toBeVisible();
		await expect(
			card.getByTestId('sign-proposal-button'),
		).toHaveCount(0);
		expect(votes).toEqual([]);

		await page.goto(newProposalPath(multisig.address));
		await expect(
			page.getByTestId('new-proposal-unchecked'),
		).toBeVisible();
		await expect(page.getByTestId('type-step')).toHaveCount(
			0,
		);

		await page.goto(
			`/multisig/${multisig.address}/overview`,
		);
		await expect(
			page.getByTestId('pod-unchecked'),
		).toBeVisible();
		await expect(
			page.getByTestId('multisig-detail'),
		).toBeVisible();
		await page.getByTestId('receive-button').click();
		const dialog = page.getByTestId('receive-dialog');
		await expect(
			dialog.getByTestId('receive-unchecked'),
		).toBeVisible();
		await expect(
			dialog.getByTestId('receive-address'),
		).toHaveCount(0);

		await stopFailing();
		await dialog
			.getByTestId('receive-unchecked-retry')
			.click();
		await expect(
			dialog.getByTestId('receive-address'),
		).toBeVisible();
		await expect(
			dialog.getByTestId('receive-unchecked'),
		).toHaveCount(0);
		await expect(
			page.getByTestId('pod-unchecked'),
		).toHaveCount(0);
	});

	test("offers no accept for an invitation while the node can't be read, and offers it after a retry", async ({
		createActor,
		createIdentity,
	}) => {
		const alice = createIdentity('alice');
		const bob = await createActor('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
			accept: false,
		});
		const stopFailing = await failAliasReads(
			bob.page,
			multisig.address,
		);

		await bob.signIn();
		await bob.page.goto('/invitations');
		await bob.page
			.getByTestId('invitation-toggle-details')
			.click();
		const review = bob.page.getByTestId(
			'invitation-review',
		);
		await expect(
			review.getByTestId('invitation-unchecked'),
		).toBeVisible();
		await expect(
			review.getByTestId('accept-invitation-button'),
		).toHaveCount(0);

		await stopFailing();
		await review
			.getByTestId('invitation-unchecked-retry')
			.click();
		await expect(
			review.getByTestId('accept-invitation-button'),
		).toBeEnabled();
		await expect(
			review.getByTestId('invitation-unchecked'),
		).toHaveCount(0);
	});

	test('warns in Receive about another signer set in the alias set, and still shows the address', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, bob, multisig } = await sharedAccount(
			{ createActor, createIdentity, chain },
			2,
		);
		await addAlias(
			chain,
			bothSign(alice, bob),
			randomAddress(),
		);

		await alice.page.goto(
			`/multisig/${multisig.address}/overview`,
		);
		await alice.page.getByTestId('receive-button').click();
		const dialog = alice.page.getByTestId('receive-dialog');
		await expect(
			dialog.getByTestId('receive-other-signer-sets'),
		).toBeVisible();
		await expect(
			dialog.getByTestId('receive-address'),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('pod-refused'),
		).toHaveCount(0);
	});

	test('refuses to sign bytes that name another chain', async ({
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
		const transactionBytes = await buildForAnotherChain(
			chain,
			multisig.address,
		);
		const proposal = await alice.api.createProposal({
			multisigAddress: multisig.address,
			transactionBytes,
			signature: await alice.signTransaction(
				transactionBytes,
			),
			network: 'localnet',
		});
		const votes = recordVotes(bob.page);
		await bob.signIn();
		await bob.page.goto(
			`/multisig/${multisig.address}/proposals/${proposal.digest}`,
		);
		await expectRefused({ bob, votes }, 'chain');
	});
});
