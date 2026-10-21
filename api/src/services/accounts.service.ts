// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Accounts and their signer sets, as the `/v1` routes see them. Unlike the
 * legacy multisig view in `multisig.service.ts`, a signer set is read through
 * its link rows (`account_signer_sets`), so an account lists every signer
 * set linked to it, not only the one with its own address.
 */

import { type PublicKey } from '@mysten/sui/cryptography';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';

import { db } from '../db';
import {
	AccountSignerSetStatus,
	OPEN_LINK_STATUSES,
	SchemaAccounts,
	SchemaAccountSignerSets,
	SchemaSignerSetMembers,
	type Account,
	type AccountSignerSet,
	type SignerSetWithMembers,
} from '../db/schema';
import {
	ApiAuthError,
	NotFoundError,
	ValidationError,
} from '../errors';
import {
	AccountKeyLabelsDataLoader,
	type KeyLabels,
} from '../loaders/account-keys.loader';
import {
	AccountProposersDataLoader,
	type Proposer,
} from '../loaders/account-proposers.loader';
import {
	batchLoadSignerSets,
	unwrap,
} from '../loaders/signer-set.loader';
import { accountsAcceptedByKeys } from './membership.service';
import {
	hasMember,
	isValidSomewhere,
	refreshAliasesOnEveryNetwork,
	resolveAccounts,
	validateLinks,
	type MirroredAliasSet,
	type ValidatedSignerSet,
} from './validity.service';

/**
 * A signer set as one account knows it: the link row (label, status, who
 * drafted it), the composition, where it is valid for the account, and the
 * account's labels for the keys.
 */
export type LinkedSignerSet = ValidatedSignerSet & {
	labels: KeyLabels;
};

export type AccountWithSignerSets = {
	account: Account;
	proposers: Proposer[];
	signerSets: LinkedSignerSet[];
	aliases: MirroredAliasSet[];
};

// Links in the order the responses list them: oldest first.
const LINK_ORDER = [
	asc(SchemaAccountSignerSets.createdAt),
	asc(SchemaAccountSignerSets.accountAddress),
];

// The account rows at `addresses`, in no particular order.
export const selectAccounts = async (
	addresses: string[],
): Promise<Account[]> =>
	addresses.length === 0
		? []
		: db
				.select()
				.from(SchemaAccounts)
				.where(inArray(SchemaAccounts.address, addresses));

// The compositions of `links`, each with where it is valid for the link's
// account and that account's labels for the keys.
const expandLinks = async (
	links: AccountSignerSet[],
): Promise<LinkedSignerSet[]> => {
	const accountAddresses = [
		...new Set(links.map((l) => l.accountAddress)),
	];
	const [signerSets, labels] = await Promise.all([
		validateLinks(links),
		AccountKeyLabelsDataLoader.loadMany(accountAddresses),
	]);
	const labelsOf = new Map(
		accountAddresses.map((address, i) => [
			address,
			unwrap(labels[i]),
		]),
	);
	return signerSets.map((signerSet) => ({
		...signerSet,
		labels:
			labelsOf.get(signerSet.link.accountAddress) ??
			new Map(),
	}));
};

// Accounts with their proposers, linked signer sets (with where each is
// valid) and alias sets, in the order of `addresses`. Unknown addresses are
// left out.
const loadAccounts = async (
	addresses: string[],
): Promise<AccountWithSignerSets[]> => {
	if (addresses.length === 0) return [];

	const [accounts, resolved, proposers, labels] =
		await Promise.all([
			selectAccounts(addresses),
			resolveAccounts(addresses),
			AccountProposersDataLoader.loadMany(addresses),
			AccountKeyLabelsDataLoader.loadMany(addresses),
		]);
	const accountOf = new Map(
		accounts.map((a) => [a.address, a]),
	);

	return addresses.flatMap((address, i) => {
		const account = accountOf.get(address);
		const resolution = resolved.get(address);
		if (!account || !resolution) return [];
		const keyLabels = unwrap(labels[i]);
		return [
			{
				account,
				proposers: unwrap(proposers[i]),
				signerSets: resolution.signerSets.map((s) => ({
					...s,
					labels: keyLabels,
				})),
				aliases: resolution.aliases,
			},
		];
	});
};

/**
 * The account at `address`. Loaded for the response of a route that has
 * just changed it, so there is no access check.
 */
export const loadAccount = async (address: string) => {
	const [account] = await loadAccounts([address]);
	if (!account) throw new NotFoundError();
	return account;
};

// The account at `address`, for a caller holding a key (accepted or not)
// in one of its signer sets that is valid on some network. Invitees of a
// draft have no access: they only see their invitation. An unknown account
// is refused the same way, so its existence does not leak.
export const getAccount = async ({
	address,
	callerKeys,
}: {
	address: string;
	callerKeys: PublicKey[];
}) => {
	await refreshAliasesOnEveryNetwork(address);
	const [account] = await loadAccounts([address]);
	if (
		!account ||
		!hasMember(
			account.signerSets.filter(isValidSomewhere),
			callerKeys,
			{ acceptedOnly: false },
		)
	)
		throw new ApiAuthError('AccessDenied');
	return account;
};

/**
 * The accounts the caller can sign for: those with a signer set, valid on
 * some network, in which one of the caller's keys has accepted (and not
 * rejected). Each account is listed once, however many of the caller's
 * keys it has.
 */
export const listAccounts = async ({
	callerKeys,
}: {
	callerKeys: PublicKey[];
}): Promise<AccountWithSignerSets[]> => {
	const keys = callerKeys.map((k) => k.toSuiPublicKey());
	// Every account linked to a composition the caller accepted; the ones
	// where no such composition is valid are dropped below.
	const addresses = await accountsAcceptedByKeys(
		keys,
		eq(SchemaSignerSetMembers.isRejected, false),
	);

	const accounts = (await loadAccounts(addresses)).filter(
		({ signerSets }) =>
			hasMember(signerSets.filter(isValidSomewhere), keys, {
				acceptedOnly: true,
				excludeRejected: true,
			}),
	);
	// Oldest first, so the order is stable.
	return accounts.sort(
		(a, b) =>
			a.account.createdAt.getTime() -
				b.account.createdAt.getTime() ||
			a.account.address.localeCompare(b.account.address),
	);
};

/**
 * The signer set at `address` as one of its accounts knows it, for the
 * responses of routes that need no session (accept, reject), so without
 * key labels: its own account's link when it has one, else the oldest link
 * still in use, else the oldest. A signer set without a link row is not
 * found.
 */
export const loadSignerSet = async (
	address: string,
): Promise<ValidatedSignerSet> => {
	const links = await db
		.select()
		.from(SchemaAccountSignerSets)
		.where(
			eq(SchemaAccountSignerSets.signerSetAddress, address),
		)
		.orderBy(...LINK_ORDER);

	const link =
		links.find((l) => l.accountAddress === address) ??
		links.find(
			(l) => l.status !== AccountSignerSetStatus.ABANDONED,
		) ??
		links[0];
	const [signerSet] = link
		? await validateLinks([link])
		: [];
	if (!signerSet) throw new NotFoundError();
	return signerSet;
};

/** A composition with the links the caller may see. */
export type SignerSetComposition = {
	signerSet: SignerSetWithMembers;
	links: (ValidatedSignerSet & { account: Account })[];
};

/**
 * The composition at `address`, with its links to the accounts the caller
 * can read, and, for a caller holding one of its keys, every link still in
 * use (what it is drafted for). No key labels: those belong to an account.
 * Refused when the caller sees no link and holds no key of it.
 */
export const getSignerSetComposition = async ({
	address,
	callerKeys,
}: {
	address: string;
	callerKeys: PublicKey[];
}): Promise<SignerSetComposition> => {
	const keys = callerKeys.map((k) => k.toSuiPublicKey());
	const links = await db
		.select()
		.from(SchemaAccountSignerSets)
		.where(
			eq(SchemaAccountSignerSets.signerSetAddress, address),
		)
		.orderBy(...LINK_ORDER);

	const accountAddresses = links.map(
		(l) => l.accountAddress,
	);
	const [resolved, accounts] = await Promise.all([
		resolveAccounts(accountAddresses),
		selectAccounts(accountAddresses),
	]);
	const accountOf = new Map(
		accounts.map((a) => [a.address, a]),
	);
	// The link of `accountAddress` to this composition, resolved.
	const ownLink = (accountAddress: string) =>
		resolved
			.get(accountAddress)
			?.signerSets.find(
				(s) => s.link.signerSetAddress === address,
			);

	// A linked composition comes with its accounts' signer sets; one
	// without links is loaded on its own.
	const signerSet =
		links.length > 0
			? ownLink(links[0].accountAddress)?.signerSet
			: (await batchLoadSignerSets([address]))[0];
	if (!signerSet) throw new ApiAuthError('AccessDenied');
	const isMember = hasMember([{ signerSet }], keys, {
		acceptedOnly: false,
	});

	const visible = links.flatMap((link) => {
		const resolution = resolved.get(link.accountAddress);
		const account = accountOf.get(link.accountAddress);
		const own = ownLink(link.accountAddress);
		if (!resolution || !account || !own) return [];
		const canRead = hasMember(
			resolution.signerSets.filter(isValidSomewhere),
			keys,
			{ acceptedOnly: false },
		);
		const isInUse =
			link.status !== AccountSignerSetStatus.ABANDONED;
		return canRead || (isMember && isInUse)
			? [{ ...own, account }]
			: [];
	});

	if (!isMember && visible.length === 0)
		throw new ApiAuthError('AccessDenied');
	return { signerSet, links: visible };
};

/** An invitation: a signer set as the account it is drafted for knows it. */
export type SignerSetInvitation = LinkedSignerSet & {
	account: Account;
};

/**
 * The invitations of `publicKey`: one per account and signer set, for each
 * link still drafting or inviting in which the key has not answered. With
 * `showRejected`, the links of the compositions it rejected that never got
 * verified, abandoned ones included. A composition shared by several
 * accounts is listed once per account, with that account's label and key
 * labels. `publicKey` must be one of the caller's keys.
 */
export const listSignerSetInvitations = async ({
	publicKey,
	showRejected,
	callerKeys,
}: {
	publicKey: string;
	showRejected: boolean;
	callerKeys: PublicKey[];
}): Promise<SignerSetInvitation[]> => {
	if (
		!callerKeys.some(
			(pubKey) => pubKey.toSuiPublicKey() === publicKey,
		)
	)
		throw new ValidationError('You are not authorized.');

	const rows = await db
		.select({ link: SchemaAccountSignerSets })
		.from(SchemaSignerSetMembers)
		.innerJoin(
			SchemaAccountSignerSets,
			eq(
				SchemaAccountSignerSets.signerSetAddress,
				SchemaSignerSetMembers.signerSetAddress,
			),
		)
		.where(
			and(
				eq(SchemaSignerSetMembers.publicKey, publicKey),
				showRejected
					? and(
							eq(SchemaSignerSetMembers.isRejected, true),
							ne(
								SchemaAccountSignerSets.status,
								AccountSignerSetStatus.VERIFIED,
							),
						)
					: and(
							eq(SchemaSignerSetMembers.isAccepted, false),
							eq(SchemaSignerSetMembers.isRejected, false),
							// An unanswered member is invited while the link is
							// still open.
							inArray(
								SchemaAccountSignerSets.status,
								OPEN_LINK_STATUSES,
							),
						),
			),
		)
		.orderBy(...LINK_ORDER);

	const links = rows.map((r) => r.link);
	const [linked, accounts] = await Promise.all([
		expandLinks(links),
		selectAccounts(links.map((l) => l.accountAddress)),
	]);
	const accountOf = new Map(
		accounts.map((a) => [a.address, a]),
	);
	return linked.flatMap((signerSet) => {
		const account = accountOf.get(
			signerSet.link.accountAddress,
		);
		// The link row references the account, so it exists.
		return account ? [{ ...signerSet, account }] : [];
	});
};
