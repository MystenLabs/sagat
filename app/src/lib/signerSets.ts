// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	Account,
	Network,
	SignerSet,
	SignerSetWithMembers,
} from '@mysten/sagat';

import type { KeyMembership } from './types';

/*
 * An account can have several signer sets, each valid on some networks:
 * those whose alias set holds its address (`validOn`, computed by the API).
 * Drafts, abandoned and retired sets are listed too, valid nowhere. These
 * helpers answer the questions the screens ask instead of assuming the
 * original set is the one that signs.
 */

/**
 * The signer sets that can sign for the account on `network`, or on some
 * network when none is given, in link order.
 */
export function validSignerSets<
	T extends Pick<SignerSet, 'validOn'>,
>(account: { signerSets: T[] }, network?: Network): T[] {
	return account.signerSets.filter((signerSet) =>
		network
			? signerSet.validOn.includes(network)
			: signerSet.validOn.length > 0,
	);
}

/** The signer sets of the account that have `publicKey` as a member. */
export function signerSetsForKey<
	T extends Pick<SignerSetWithMembers, 'members'>,
>(account: { signerSets: T[] }, publicKey: string): T[] {
	return account.signerSets.filter((signerSet) =>
		signerSet.members.some(
			(m) => m.publicKey === publicKey,
		),
	);
}

/**
 * The one signer set to summarise the account with, where the screen has
 * room for a single one: the set valid on the most networks, ties broken
 * by link order, so an account that never rotated shows its original set.
 * With `network`, only sets valid there are considered. Undefined when no
 * set qualifies. Never use it to decide access, progress or execution:
 * any valid set counts.
 */
export function primarySignerSet<
	T extends Pick<SignerSet, 'validOn'>,
>(
	account: { signerSets: T[] },
	network?: Network,
): T | undefined {
	return validSignerSets(account, network).reduce<
		T | undefined
	>(
		(best, signerSet) =>
			!best ||
			signerSet.validOn.length > best.validOn.length
				? signerSet
				: best,
		undefined,
	);
}

/**
 * The signer set the overview shows: the primary set on `network`, else
 * on any network, else the original set (at the account's address), so a
 * locked-out account still shows who used to sign for it.
 */
export function displayedSignerSet<
	T extends Pick<SignerSet, 'address' | 'validOn'>,
>(
	account: { address: string; signerSets: T[] },
	network: Network,
): T | undefined {
	return (
		primarySignerSet(account, network) ??
		primarySignerSet(account) ??
		account.signerSets.find(
			(s) => s.address === account.address,
		) ??
		account.signerSets[0]
	);
}

/**
 * What the connected key can do for the account on `network`:
 * - `locked-out`: no signer set of the account is valid there, so nobody
 *   can sign for it through Sagat.
 * - `not-a-signer`: some set is valid there, but the key is not an
 *   accepted member of any of them. It can view, not sign.
 * - `signer`: the key is an accepted member of a set valid there.
 */
export type NetworkAccess =
	'locked-out' | 'not-a-signer' | 'signer';

export function getNetworkAccess(
	account: { signerSets: SignerSetWithMembers[] },
	network: Network,
	publicKey: string | undefined,
): NetworkAccess {
	const valid = validSignerSets(account, network);
	if (valid.length === 0) return 'locked-out';
	const canSign =
		!!publicKey &&
		valid.some((s) =>
			s.members.some(
				(m) => m.publicKey === publicKey && m.isAccepted,
			),
		);
	return canSign ? 'signer' : 'not-a-signer';
}

/**
 * How `publicKey` stands in `signerSets`, with the counts the cards show,
 * over the sets it is a member of. Accepted when it accepted in any of
 * them, rejected when it rejected in all. Pending and rejected members are
 * counted once per key. Undefined when the key is in none of them.
 */
export function getKeyMembership(
	signerSets: SignerSetWithMembers[],
	publicKey: string,
): KeyMembership | undefined {
	const sets = signerSetsForKey({ signerSets }, publicKey);
	if (sets.length === 0) return undefined;
	const own = sets.flatMap((s) =>
		s.members.filter((m) => m.publicKey === publicKey),
	);
	const members = sets.flatMap((s) => s.members);
	const distinctKeys = (
		predicate: (m: (typeof members)[number]) => boolean,
	) =>
		new Set(
			members.filter(predicate).map((m) => m.publicKey),
		).size;
	return {
		isAccepted: own.some((m) => m.isAccepted),
		isRejected: own.every((m) => m.isRejected),
		pendingMembers: distinctKeys(
			(m) => !m.isAccepted && !m.isRejected,
		),
		rejectedMembers: distinctKeys((m) => m.isRejected),
	};
}

/**
 * What is worth warning about in the account's alias sets, which the API
 * reads from chain per network: the dangerous case is believing a
 * rotation happened everywhere when it happened on one network only. Not
 * rendered yet; the redesigned overview will show it.
 */
export type AliasWarning =
	| {
			kind: 'networks-disagree';
			// Every network with its alias set, sorted by network.
			aliasSets: {
				network: Network;
				addresses: string[];
			}[];
	  }
	| {
			// An address allowed to sign for the account that is not one of
			// its signer sets: a single key, or a set added outside Sagat.
			kind: 'unknown-alias';
			network: Network;
			address: string;
	  };

export function getAliasWarnings(
	account: Pick<Account, 'signerSets' | 'aliases'>,
): AliasWarning[] {
	const warnings: AliasWarning[] = [];
	const key = (addresses: string[]) =>
		[...addresses].sort().join(',');
	const aliasSets = [...account.aliases].sort((a, b) =>
		a.network.localeCompare(b.network),
	);
	if (
		new Set(aliasSets.map((a) => key(a.addresses))).size > 1
	)
		warnings.push({
			kind: 'networks-disagree',
			aliasSets: aliasSets.map(
				({ network, addresses }) => ({
					network,
					addresses,
				}),
			),
		});

	const known = new Set(
		account.signerSets.map((s) => s.address),
	);
	for (const { network, addresses } of aliasSets)
		for (const address of addresses)
			if (!known.has(address))
				warnings.push({
					kind: 'unknown-alias',
					network,
					address,
				});
	return warnings;
}
