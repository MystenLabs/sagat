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
	SchemaAccounts,
	SchemaAccountSignerSets,
	SchemaSignerSetMembers,
	type Account,
	type AccountSignerSet,
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
import { SignerSetDataLoader } from '../loaders/signer-set.loader';
import { jwtHasSignerSetMemberAccess } from './membership.service';
import {
	hasMember,
	loadAliasSets,
	resolveAccounts,
	validOn,
	validSignerSetsAcrossNetworks,
	type AliasSet,
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
	aliases: AliasSet[];
};

const unwrap = <T>(value: T | Error): T => {
	if (value instanceof Error) throw value;
	return value;
};

// The compositions of `links`, each with where it is valid for the link's
// account and that account's labels for the keys.
const expandLinks = async (
	links: AccountSignerSet[],
): Promise<LinkedSignerSet[]> => {
	const [signerSets, labels, aliasSets] = await Promise.all(
		[
			SignerSetDataLoader.loadMany(
				links.map((l) => l.signerSetAddress),
			),
			AccountKeyLabelsDataLoader.loadMany(
				links.map((l) => l.accountAddress),
			),
			loadAliasSets(links.map((l) => l.accountAddress)),
		],
	);
	return links.flatMap((link, i) => {
		const signerSet = unwrap(signerSets[i]);
		// The link row references the signer set, so it exists.
		if (!signerSet) return [];
		return [
			{
				link,
				signerSet,
				validOn: validOn(
					link.signerSetAddress,
					aliasSets.get(link.accountAddress) ?? [],
				),
				labels: unwrap(labels[i]),
			},
		];
	});
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
			db
				.select()
				.from(SchemaAccounts)
				.where(inArray(SchemaAccounts.address, addresses)),
			resolveAccounts(addresses),
			AccountProposersDataLoader.loadMany(addresses),
			AccountKeyLabelsDataLoader.loadMany(addresses),
		]);

	return addresses.flatMap((address, i) => {
		const account = accounts.find(
			(a) => a.address === address,
		);
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

// Whether one of `callerKeys` is a member, accepted or not, of a signer
// set of the account that is valid on some network. Invitees of a draft
// have no access: they only see their invitation.
const hasAccountAccess = async (
	accountAddress: string,
	callerKeys: PublicKey[],
) =>
	hasMember(
		await validSignerSetsAcrossNetworks(accountAddress),
		callerKeys,
		{ acceptedOnly: false },
	);

// The account at `address`, for a caller holding a key (accepted or not)
// in one of its signer sets that is valid on some network.
export const getAccount = async ({
	address,
	callerKeys,
}: {
	address: string;
	callerKeys: PublicKey[];
}) => {
	if (!(await hasAccountAccess(address, callerKeys)))
		throw new ApiAuthError('AccessDenied');
	return loadAccount(address);
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
	const rows = await db
		.selectDistinct({
			address: SchemaAccountSignerSets.accountAddress,
		})
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
				inArray(SchemaSignerSetMembers.publicKey, keys),
				eq(SchemaSignerSetMembers.isAccepted, true),
				eq(SchemaSignerSetMembers.isRejected, false),
			),
		);

	const accounts = (
		await loadAccounts(rows.map((r) => r.address))
	).filter(({ signerSets }) =>
		signerSets.some(
			({ signerSet, validOn }) =>
				validOn.length > 0 &&
				signerSet.members.some(
					(m) =>
						keys.includes(m.publicKey) &&
						m.isAccepted &&
						!m.isRejected,
				),
		),
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
 * responses of routes that need no session (accept, reject): its own
 * account's link when it has one, else the oldest link still in use, else
 * the oldest. Signer sets without a link row are left out.
 */
const loadSignerSets = async (
	signerSetAddresses: string[],
): Promise<LinkedSignerSet[]> => {
	if (signerSetAddresses.length === 0) return [];

	const links = await db
		.select()
		.from(SchemaAccountSignerSets)
		.where(
			inArray(
				SchemaAccountSignerSets.signerSetAddress,
				signerSetAddresses,
			),
		)
		.orderBy(
			asc(SchemaAccountSignerSets.createdAt),
			asc(SchemaAccountSignerSets.accountAddress),
		);

	const chosen = signerSetAddresses.flatMap((address) => {
		const own = links.filter(
			(l) => l.signerSetAddress === address,
		);
		const link =
			own.find((l) => l.accountAddress === address) ??
			own.find(
				(l) =>
					l.status !== AccountSignerSetStatus.ABANDONED,
			) ??
			own[0];
		return link ? [link] : [];
	});
	return expandLinks(chosen);
};

/**
 * The signer set at `address`. Loaded for the response of a route that has
 * just changed it, so there is no access check.
 */
export const loadSignerSet = async (address: string) => {
	const [signerSet] = await loadSignerSets([address]);
	if (!signerSet) throw new NotFoundError();
	return signerSet;
};

// The signer set at `address`, for a caller holding one of its keys
// (accepted or not).
export const getSignerSetForMember = async ({
	address,
	callerKeys,
}: {
	address: string;
	callerKeys: PublicKey[];
}) => {
	if (
		!(await jwtHasSignerSetMemberAccess(
			address,
			callerKeys,
			false,
		))
	)
		throw new ApiAuthError('AccessDenied');
	return loadSignerSet(address);
};

/** An invitation: a signer set as the account it is drafted for knows it. */
export type SignerSetInvitation = LinkedSignerSet & {
	account: Account;
};

// Link statuses under which an unanswered member is invited.
const INVITING_STATUSES = [
	AccountSignerSetStatus.DRAFT,
	AccountSignerSetStatus.INVITING,
];

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
							inArray(
								SchemaAccountSignerSets.status,
								INVITING_STATUSES,
							),
						),
			),
		)
		.orderBy(
			asc(SchemaAccountSignerSets.createdAt),
			asc(SchemaAccountSignerSets.accountAddress),
		);

	const links = rows.map((r) => r.link);
	const [linked, accounts] = await Promise.all([
		expandLinks(links),
		links.length === 0
			? []
			: db
					.select()
					.from(SchemaAccounts)
					.where(
						inArray(
							SchemaAccounts.address,
							links.map((l) => l.accountAddress),
						),
					),
	]);
	return linked.flatMap((signerSet) => {
		const account = accounts.find(
			(a) => a.address === signerSet.link.accountAddress,
		);
		// The link row references the account, so it exists.
		return account ? [{ ...signerSet, account }] : [];
	});
};
