// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Which signer sets are valid for an account, per network: the signer
 * resolver of docs/account-rotation.md. A linked signer set is valid on a
 * network when its address is in the account's alias set there, as the
 * alias mirror (`account_alias_state`, `account_aliases`) knows it. Every
 * access check and tally of a proposal flow picks its signer sets through
 * `signerSetsInScope`: `/v1` the valid ones, the legacy routes the original
 * composition only. Routes never read the alias rows themselves.
 */

import { type PublicKey } from '@mysten/sui/cryptography';
import { and, asc, inArray } from 'drizzle-orm';

import { db } from '../db';
import { SUPPORTED_NETWORKS } from '../db/env';
import {
	SchemaAccountAliases,
	SchemaAccountAliasState,
	SchemaAccountSignerSets,
	type AccountSignerSet,
	type SignerSetWithMembers,
} from '../db/schema';
import {
	batchLoadSignerSets,
	SignerSetDataLoader,
	unwrap,
} from '../loaders/signer-set.loader';
import { type SuiNetwork } from '../utils/client';

/**
 * An account's alias set on one network, as the mirror knows it. The chain
 * view, read by the refresh, is `AliasSet` in `utils/aliases.ts`.
 */
export type MirroredAliasSet = {
	network: SuiNetwork;
	// Sorted by address: the mirror keeps no order.
	addresses: string[];
	// When the refresh read it, or null while the set is the default
	// `{account}` (never refreshed, or `enable` never called).
	observedAt: Date | null;
};

/** A signer set linked to an account, with where it is valid for it. */
export type ValidatedSignerSet = {
	link: AccountSignerSet;
	signerSet: SignerSetWithMembers;
	// The supported networks whose alias set holds the signer set.
	validOn: SuiNetwork[];
};

type ResolvedAccount = {
	signerSets: ValidatedSignerSet[];
	aliases: MirroredAliasSet[];
};

/**
 * Design step 6 ("Refresh") plugs in here: re-read the alias set from
 * chain when the mirror for the network is missing or older than a minute,
 * and decide on the result. This pass has no chain access, so the mirror
 * is used as it is.
 */
const refreshAliasesIfStale = async (
	_accountAddress: string,
	_network: SuiNetwork,
): Promise<void> => {};

// The refresh hook for a network-agnostic decision about an account.
export const refreshAliasesOnEveryNetwork = async (
	accountAddress: string,
) => {
	await Promise.all(
		SUPPORTED_NETWORKS.map((network) =>
			refreshAliasesIfStale(accountAddress, network),
		),
	);
};

// Keys the mirror rows of an account on a network.
const mirrorKey = (account: string, network: string) =>
	`${account}:${network}`;

/**
 * The alias set of each account on each supported network. Mirror rows of
 * other networks are ignored. No state row, or `exists = false`, means the
 * alias set is `{account}`.
 */
const loadAliasSets = async (
	accountAddresses: string[],
): Promise<Map<string, MirroredAliasSet[]>> => {
	const accounts = [...new Set(accountAddresses)];
	if (accounts.length === 0) return new Map();

	const networks = [...SUPPORTED_NETWORKS];
	const [states, aliases] = await Promise.all([
		db
			.select()
			.from(SchemaAccountAliasState)
			.where(
				and(
					inArray(
						SchemaAccountAliasState.accountAddress,
						accounts,
					),
					inArray(
						SchemaAccountAliasState.network,
						networks,
					),
				),
			),
		db
			.select()
			.from(SchemaAccountAliases)
			.where(
				and(
					inArray(
						SchemaAccountAliases.accountAddress,
						accounts,
					),
					inArray(SchemaAccountAliases.network, networks),
				),
			)
			.orderBy(asc(SchemaAccountAliases.aliasAddress)),
	]);

	const stateOf = new Map(
		states.map((state) => [
			mirrorKey(state.accountAddress, state.network),
			state,
		]),
	);
	// Each list keeps the query's order, by address.
	const aliasesOf = new Map<string, string[]>();
	for (const alias of aliases) {
		const key = mirrorKey(
			alias.accountAddress,
			alias.network,
		);
		const list = aliasesOf.get(key);
		if (list) list.push(alias.aliasAddress);
		else aliasesOf.set(key, [alias.aliasAddress]);
	}

	return new Map(
		accounts.map((account) => [
			account,
			networks.map((network): MirroredAliasSet => {
				const key = mirrorKey(account, network);
				const state = stateOf.get(key);
				if (!state?.exists)
					return {
						network,
						addresses: [account],
						observedAt: null,
					};
				return {
					network,
					addresses: aliasesOf.get(key) ?? [],
					observedAt: state.observedAt,
				};
			}),
		]),
	);
};

/** The networks on which `signerSetAddress` is in the alias set. */
const validOn = (
	signerSetAddress: string,
	aliasSets: MirroredAliasSet[],
): SuiNetwork[] =>
	aliasSets
		.filter((s) => s.addresses.includes(signerSetAddress))
		.map((s) => s.network);

// Loads signer sets by address, like `batchLoadSignerSets`.
type SignerSetBatch = (
	addresses: readonly string[],
) => Promise<(SignerSetWithMembers | null | Error)[]>;

// Across accounts, through the loader, which batches concurrent lookups.
const loadThroughLoader: SignerSetBatch = (addresses) =>
	SignerSetDataLoader.loadMany(addresses);

/**
 * The composition of each of `links`, with the networks it is valid on for
 * the link's account. Pass `aliasSets` when they are loaded already, and
 * `loadSignerSets` to load the compositions other than through the loader.
 */
export const validateLinks = async (
	links: AccountSignerSet[],
	{
		aliasSets,
		loadSignerSets = loadThroughLoader,
	}: {
		aliasSets?: Map<string, MirroredAliasSet[]>;
		loadSignerSets?: SignerSetBatch;
	} = {},
): Promise<ValidatedSignerSet[]> => {
	if (links.length === 0) return [];
	const [signerSets, aliases] = await Promise.all([
		loadSignerSets(links.map((l) => l.signerSetAddress)),
		aliasSets ??
			loadAliasSets(links.map((l) => l.accountAddress)),
	]);
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
					aliases.get(link.accountAddress) ?? [],
				),
			},
		];
	});
};

/**
 * Every signer set linked to each account, oldest link first, with the
 * networks it is valid on, and the account's alias sets. A link is listed
 * whatever its status: a draft is simply valid nowhere until it is in an
 * alias set. Aliases that are not linked signer sets (unknown addresses,
 * single keys) are only in `aliases`. Unknown accounts resolve to nothing.
 */
export const resolveAccounts = async (
	accountAddresses: string[],
	loadSignerSets?: SignerSetBatch,
): Promise<Map<string, ResolvedAccount>> => {
	const accounts = [...new Set(accountAddresses)];
	if (accounts.length === 0) return new Map();

	const [links, aliasSets] = await Promise.all([
		db
			.select()
			.from(SchemaAccountSignerSets)
			.where(
				inArray(
					SchemaAccountSignerSets.accountAddress,
					accounts,
				),
			)
			.orderBy(
				asc(SchemaAccountSignerSets.createdAt),
				asc(SchemaAccountSignerSets.signerSetAddress),
			),
		loadAliasSets(accounts),
	]);
	const signerSetsOf = new Map<
		string,
		ValidatedSignerSet[]
	>();
	for (const signerSet of await validateLinks(links, {
		aliasSets,
		loadSignerSets,
	})) {
		const account = signerSet.link.accountAddress;
		const list = signerSetsOf.get(account);
		if (list) list.push(signerSet);
		else signerSetsOf.set(account, [signerSet]);
	}

	return new Map(
		accounts.map((account) => [
			account,
			{
				aliases: aliasSets.get(account) ?? [],
				signerSets: signerSetsOf.get(account) ?? [],
			},
		]),
	);
};

// One account's lookup has all its keys at hand, so it queries directly
// instead of waiting for the loader's batch.
const resolveAccount = async (accountAddress: string) =>
	(
		await resolveAccounts(
			[accountAddress],
			batchLoadSignerSets,
		)
	).get(accountAddress) ?? { signerSets: [], aliases: [] };

// Whether a signer set can sign for its account somewhere.
export const isValidSomewhere = (
	signerSet: Pick<ValidatedSignerSet, 'validOn'>,
) => signerSet.validOn.length > 0;

/**
 * The account's signer sets that are valid on `network`, or without one,
 * on at least one supported network (for network-agnostic decisions:
 * reading the account, changing its proposers), oldest link first.
 * Without a refreshed mirror that is its original composition.
 */
export const validSignerSets = async (
	accountAddress: string,
	network?: SuiNetwork,
): Promise<ValidatedSignerSet[]> => {
	await (network
		? refreshAliasesIfStale(accountAddress, network)
		: refreshAliasesOnEveryNetwork(accountAddress));
	return (
		await resolveAccount(accountAddress)
	).signerSets.filter((s) =>
		network
			? s.validOn.includes(network)
			: isValidSomewhere(s),
	);
};

/**
 * Whether one of `keys` is a member of one of `signerSets`; with
 * `acceptedOnly`, a member that accepted its invitation, and with
 * `excludeRejected`, one that has not rejected it.
 */
export const hasMember = (
	signerSets: Pick<ValidatedSignerSet, 'signerSet'>[],
	keys: (PublicKey | string)[],
	{
		acceptedOnly,
		excludeRejected = false,
	}: { acceptedOnly: boolean; excludeRejected?: boolean },
) => {
	const publicKeys = keys.map((k) =>
		typeof k === 'string' ? k : k.toSuiPublicKey(),
	);
	return signerSets.some(({ signerSet }) =>
		signerSet.members.some(
			(m) =>
				publicKeys.includes(m.publicKey) &&
				(!acceptedOnly || m.isAccepted) &&
				(!excludeRejected || !m.isRejected),
		),
	);
};

/**
 * Which signer sets a flow lets act for an account. The legacy routes know
 * only the original composition, the one at the account's address, and
 * keep their checks; `/v1` asks the resolver for the valid signer sets.
 */
export type SignerSetScope = 'original' | 'valid';

/** A signer set that `SignerSetScope` lets act for an account. */
export type ScopedSignerSet = Pick<
	ValidatedSignerSet,
	'signerSet'
>;

/**
 * The signer sets `scope` lets act for the account. `'original'`: the
 * composition at its address, none for an unknown address. `'valid'`: the
 * sets valid on `network`, or on some network without one.
 */
export const signerSetsInScope = async (
	accountAddress: string,
	network: SuiNetwork | undefined,
	scope: SignerSetScope,
): Promise<ScopedSignerSet[]> => {
	if (scope === 'valid')
		return validSignerSets(accountAddress, network);
	const [signerSet] = await batchLoadSignerSets([
		accountAddress,
	]);
	return signerSet ? [{ signerSet }] : [];
};

// Whether one of `keys` is an accepted member of a signer set in scope.
export const isAcceptedMember = async (
	accountAddress: string,
	network: SuiNetwork | undefined,
	scope: SignerSetScope,
	keys: (PublicKey | string)[],
) =>
	hasMember(
		await signerSetsInScope(accountAddress, network, scope),
		keys,
		{ acceptedOnly: true },
	);
