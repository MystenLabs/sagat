// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Which signer sets are valid for an account, per network: the signer
 * resolver of docs/account-rotation.md. A linked signer set is valid on a
 * network when its address is in the account's alias set there, as the
 * alias mirror (`account_alias_state`, `account_aliases`) knows it. Every
 * `/v1` access check and tally goes through this module; routes never read
 * the alias rows themselves. The legacy routes keep checking the original
 * composition only.
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
import { SignerSetDataLoader } from '../loaders/signer-set.loader';
import { type SuiNetwork } from '../utils/client';

/** An account's alias set on one network, as the mirror knows it. */
export type AliasSet = {
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

export type ResolvedAccount = {
	signerSets: ValidatedSignerSet[];
	aliases: AliasSet[];
};

/**
 * Design step 6 ("Refresh") plugs in here: re-read the alias set from
 * chain when the mirror for the network is missing or older than a minute,
 * and decide on the result. This pass has no chain access, so the mirror
 * is used as it is.
 */
export const refreshAliasesIfStale = async (
	_accountAddress: string,
	_network: SuiNetwork,
): Promise<void> => {};

// The refresh hook for a network-agnostic decision about an account.
export const refreshAliasesOnEveryNetwork = async (
	accountAddress: string,
) => {
	for (const network of SUPPORTED_NETWORKS)
		await refreshAliasesIfStale(accountAddress, network);
};

/**
 * The alias set of each account on each supported network. Mirror rows of
 * other networks are ignored. No state row, or `exists = false`, means the
 * alias set is `{account}`.
 */
export const loadAliasSets = async (
	accountAddresses: string[],
): Promise<Map<string, AliasSet[]>> => {
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

	return new Map(
		accounts.map((account) => [
			account,
			networks.map((network): AliasSet => {
				const state = states.find(
					(s) =>
						s.accountAddress === account &&
						s.network === network,
				);
				if (!state?.exists)
					return {
						network,
						addresses: [account],
						observedAt: null,
					};
				return {
					network,
					addresses: aliases
						.filter(
							(a) =>
								a.accountAddress === account &&
								a.network === network,
						)
						.map((a) => a.aliasAddress),
					observedAt: state.observedAt,
				};
			}),
		]),
	);
};

/** The networks on which `signerSetAddress` is in the alias set. */
export const validOn = (
	signerSetAddress: string,
	aliasSets: AliasSet[],
): SuiNetwork[] =>
	aliasSets
		.filter((s) => s.addresses.includes(signerSetAddress))
		.map((s) => s.network);

const unwrap = <T>(value: T | Error): T => {
	if (value instanceof Error) throw value;
	return value;
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
	const signerSets = await SignerSetDataLoader.loadMany(
		links.map((l) => l.signerSetAddress),
	);

	return new Map(
		accounts.map((account) => {
			const aliases = aliasSets.get(account) ?? [];
			return [
				account,
				{
					aliases,
					signerSets: links.flatMap((link, i) => {
						if (link.accountAddress !== account) return [];
						const signerSet = unwrap(signerSets[i]);
						// The link row references the signer set, so it exists.
						if (!signerSet) return [];
						return [
							{
								link,
								signerSet,
								validOn: validOn(
									link.signerSetAddress,
									aliases,
								),
							},
						];
					}),
				},
			];
		}),
	);
};

const resolveAccount = async (accountAddress: string) =>
	(await resolveAccounts([accountAddress])).get(
		accountAddress,
	) ?? { signerSets: [], aliases: [] };

/**
 * The account's signer sets that are valid on `network`, oldest link
 * first. Without a refreshed mirror that is its original composition.
 */
export const validSignerSets = async (
	accountAddress: string,
	network: SuiNetwork,
): Promise<ValidatedSignerSet[]> => {
	await refreshAliasesIfStale(accountAddress, network);
	return (
		await resolveAccount(accountAddress)
	).signerSets.filter((s) => s.validOn.includes(network));
};

/**
 * The account's signer sets that are valid on at least one supported
 * network, for network-agnostic decisions (reading the account, changing
 * its proposers).
 */
export const validSignerSetsAcrossNetworks = async (
	accountAddress: string,
): Promise<ValidatedSignerSet[]> => {
	await refreshAliasesOnEveryNetwork(accountAddress);
	return (
		await resolveAccount(accountAddress)
	).signerSets.filter((s) => s.validOn.length > 0);
};

/**
 * Whether one of `keys` is a member of one of `signerSets`; with
 * `acceptedOnly`, a member that accepted its invitation.
 */
export const hasMember = (
	signerSets: Pick<ValidatedSignerSet, 'signerSet'>[],
	keys: (PublicKey | string)[],
	{ acceptedOnly }: { acceptedOnly: boolean },
) => {
	const publicKeys = keys.map((k) =>
		typeof k === 'string' ? k : k.toSuiPublicKey(),
	);
	return signerSets.some(({ signerSet }) =>
		signerSet.members.some(
			(m) =>
				publicKeys.includes(m.publicKey) &&
				(!acceptedOnly || m.isAccepted),
		),
	);
};

/**
 * Which signer sets a flow lets act for an account. The legacy routes know
 * only the original composition, the one at the account's address, and
 * keep their checks; `/v1` asks the resolver for the valid signer sets.
 */
export type SignerSetScope = 'original' | 'valid';

/**
 * Whether one of `keys` is an accepted member of a signer set of the
 * account valid on `network`, or with `'any'`, on some network.
 */
export const isAcceptedMember = async (
	accountAddress: string,
	network: SuiNetwork | 'any',
	keys: (PublicKey | string)[],
) =>
	hasMember(
		network === 'any'
			? await validSignerSetsAcrossNetworks(accountAddress)
			: await validSignerSets(accountAddress, network),
		keys,
		{ acceptedOnly: true },
	);
