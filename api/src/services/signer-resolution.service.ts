// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The signer resolver (docs/account-rotation.md). The one place that turns an
 * account's alias set into signer sets and public keys. Routes never read
 * alias rows directly; they call this service.
 *
 * Alias entries are addresses. Each is classified at read time as a known
 * signer set, a single known key, or unknown.
 *
 * Every helper takes `{ refresh?: boolean }`. By default it reads the mirror
 * and refreshes from chain first when the network was never refreshed or its
 * state is older than `ACCESS_CHECK_MAX_AGE_MS`; it refuses (throws
 * `AliasStateUnavailableError`) only when that refresh fails. `true` always
 * refreshes, `false` never does (for callers that already refreshed in the
 * same request).
 */

import { type PublicKey } from '@mysten/sui/cryptography';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db';
import { SUPPORTED_NETWORKS } from '../db/env';
import {
	SchemaAccountProposers,
	SchemaAccountSignerSets,
	SchemaAddresses,
	type AccountSignerSet,
	type SignerSetWithMembers,
} from '../db/schema';
import { SignerSetDataLoader } from '../loaders/signer-set.loader';
import { type SuiNetwork } from '../utils/client';
import { parsePublicKey } from '../utils/pubKey';
import {
	accountExists,
	getFreshAliases,
} from './aliases.service';

export { isRotated } from './aliases.service';
export {
	orderedSignaturesFor,
	pickExecutableSignerSet,
	proposalProgress,
	type ProposalSignatures,
	type SignerSetComposition,
	type SignerSetProgress,
} from './signer-progress';

export type RefreshOption = { refresh?: boolean };

/** A signer set with its label in the account (null without an `account_signer_sets` row). */
export type AccountSignerSetWithMembers =
	SignerSetWithMembers & Pick<AccountSignerSet, 'label'>;

export type AliasResolution =
	| {
			kind: 'signer_set';
			address: string;
			signerSet: AccountSignerSetWithMembers;
			/** Every member accepted. Unverified sets are returned; callers decide. */
			isVerified: boolean;
	  }
	| { kind: 'key'; address: string; publicKey: string }
	| { kind: 'unknown'; address: string };

export interface ResolvedSigners {
	accountAddress: string;
	network: SuiNetwork;
	/** Every alias, classified, in mirror order (sorted by address). */
	aliases: AliasResolution[];
	/** The aliases that are known signer sets: the valid signer sets. */
	signerSets: AccountSignerSetWithMembers[];
	/** False when the account never called `enable` on this network: the alias set is `{account}`. */
	exists: boolean;
	observedAt: Date | null;
	observedVersion: number | null;
}

type KeyLike = PublicKey | string;

const toSuiPublicKey = (key: KeyLike) =>
	typeof key === 'string' ? key : key.toSuiPublicKey();

const toSuiAddress = (key: KeyLike) =>
	(typeof key === 'string'
		? parsePublicKey(key)
		: key
	).toSuiAddress();

/**
 * Classify the alias addresses of an account as signer sets (with their
 * label in the account), single keys, or unknown.
 */
async function classifyAliases(
	accountAddress: string,
	addresses: string[],
): Promise<AliasResolution[]> {
	if (addresses.length === 0) return [];

	const [signerSets, keys, links] = await Promise.all([
		SignerSetDataLoader.loadMany(addresses),
		db
			.select()
			.from(SchemaAddresses)
			.where(inArray(SchemaAddresses.address, addresses)),
		db
			.select({
				signerSetAddress:
					SchemaAccountSignerSets.signerSetAddress,
				label: SchemaAccountSignerSets.label,
			})
			.from(SchemaAccountSignerSets)
			.where(
				and(
					eq(
						SchemaAccountSignerSets.accountAddress,
						accountAddress,
					),
					inArray(
						SchemaAccountSignerSets.signerSetAddress,
						addresses,
					),
				),
			),
	]);

	return addresses.map((address, i): AliasResolution => {
		const signerSet = signerSets[i];
		if (signerSet instanceof Error) throw signerSet;
		if (signerSet)
			return {
				kind: 'signer_set',
				address,
				signerSet: {
					...signerSet,
					label:
						links.find(
							(l) => l.signerSetAddress === address,
						)?.label ?? null,
				},
				isVerified: signerSet.isVerified,
			};

		const key = keys.find((k) => k.address === address);
		if (key)
			return {
				kind: 'key',
				address,
				publicKey: key.publicKey,
			};

		return { kind: 'unknown', address };
	});
}

/** Accepted keys of every signer set alias, plus single-key aliases. Deduplicated. */
function leavesOf(aliases: AliasResolution[]): string[] {
	const keys = new Set<string>();
	for (const alias of aliases) {
		if (alias.kind === 'key') keys.add(alias.publicKey);
		if (alias.kind === 'signer_set') {
			for (const member of alias.signerSet.members) {
				if (member.isAccepted) keys.add(member.publicKey);
			}
		}
	}
	return [...keys];
}

/**
 * Resolve the alias set of an account on a network into signer sets, keys,
 * and unknown addresses. Throws `NotFoundError` for an address that is not
 * an account.
 */
export async function resolveValidSignerSets(
	accountAddress: string,
	network: SuiNetwork,
	options: RefreshOption = {},
): Promise<ResolvedSigners> {
	const account = normalizeSuiAddress(accountAddress);
	const mirror = await getFreshAliases(
		account,
		network,
		options,
	);
	const aliases = await classifyAliases(
		account,
		mirror.aliases,
	);

	return {
		accountAddress: account,
		network,
		aliases,
		signerSets: aliases.flatMap((a) =>
			a.kind === 'signer_set' ? [a.signerSet] : [],
		),
		exists: mirror.exists,
		observedAt: mirror.observedAt,
		observedVersion: mirror.observedVersion,
	};
}

/**
 * The public keys that can sign for the account on a network: accepted
 * members of every valid signer set, plus single-key aliases. Deduplicated.
 * This is also the recipient list for notifications later.
 */
export async function leafPublicKeys(
	accountAddress: string,
	network: SuiNetwork,
	options: RefreshOption = {},
): Promise<string[]> {
	const { aliases } = await resolveValidSignerSets(
		accountAddress,
		network,
		options,
	);
	return leavesOf(aliases);
}

/**
 * True if `publicKey` can sign for the account on the network: the check for
 * anything that acts on one network (propose, vote, cancel, execute). False
 * for an address that is not an account.
 */
export async function canSignFor(
	publicKey: KeyLike,
	accountAddress: string,
	network: SuiNetwork,
	options: RefreshOption = {},
): Promise<boolean> {
	if (!(await accountExists(accountAddress))) return false;
	const leaves = await leafPublicKeys(
		accountAddress,
		network,
		options,
	);
	return leaves.includes(toSuiPublicKey(publicKey));
}

/**
 * True if any of `publicKeys` is a proposer of the account, or a leaf of the
 * account on `network`. Without a network, a leaf on any supported network
 * counts: that union is for network-agnostic reads only (account overview,
 * invitations). Anything that acts on one network uses `canSignFor`. False
 * for an address that is not an account.
 */
export async function hasAccountAccess(
	publicKeys: KeyLike[],
	accountAddress: string,
	options: RefreshOption & { network?: SuiNetwork } = {},
): Promise<boolean> {
	if (publicKeys.length === 0 || !accountAddress)
		return false;
	const account = normalizeSuiAddress(accountAddress);
	if (!(await accountExists(account))) return false;

	const proposer =
		await db.query.SchemaAccountProposers.findFirst({
			where: and(
				eq(SchemaAccountProposers.accountAddress, account),
				inArray(
					SchemaAccountProposers.address,
					publicKeys.map(toSuiAddress),
				),
			),
		});
	if (proposer) return true;

	// A key is a leaf of an alias regardless of network, so the leaves across
	// networks are the leaves of the union of the alias sets.
	const networks = options.network
		? [options.network]
		: SUPPORTED_NETWORKS;
	const mirrors = await Promise.all(
		networks.map((network) =>
			getFreshAliases(account, network, options),
		),
	);
	const aliases = new Set(
		mirrors.flatMap((m) => m.aliases),
	);

	const leaves = new Set(
		leavesOf(await classifyAliases(account, [...aliases])),
	);
	return publicKeys.some((key) =>
		leaves.has(toSuiPublicKey(key)),
	);
}
