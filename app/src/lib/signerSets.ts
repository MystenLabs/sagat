// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	Network,
	SignerSet,
	SignerSetWithMembers,
} from '@mysten/sagat';

import type { KeyMembership } from './types';
import { extractPublicKeyFromBase64 } from './wallet';

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

/** The signer sets among `signerSets` that have `publicKey` as a member. */
export function signerSetsForKey<
	T extends Pick<SignerSetWithMembers, 'members'>,
>(signerSets: T[], publicKey: string): T[] {
	return signerSets.filter((signerSet) =>
		signerSet.members.some(
			(m) => m.publicKey === publicKey,
		),
	);
}

// The set valid on the most networks, ties broken by link order, among
// those valid on `network` if given, else on some network.
function primarySignerSet<
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
 * The one signer set to summarise the account with, where the screen has
 * room for a single one: the set valid on the most networks (on `network`
 * when given and one is valid there), ties broken by link order, so an
 * account that never rotated shows its original set. A locked-out account
 * shows its original set (at the account's address), who used to sign
 * for it. Never use it to decide access, progress or execution: any valid
 * set counts.
 */
export function summarySignerSet<
	T extends Pick<SignerSet, 'address' | 'validOn'>,
>(
	account: { address: string; signerSets: T[] },
	network?: Network,
): T | undefined {
	return (
		(network
			? primarySignerSet(account, network)
			: undefined) ??
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
	const sets = signerSetsForKey(signerSets, publicKey);
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
 * Whether `address` is the address of a member of one of `signerSets`.
 * Keys that fail to parse are skipped.
 */
export function signerSetsHaveAddress(
	signerSets: { members: { publicKey: string }[] }[],
	address: string | undefined,
): boolean {
	if (!address) return false;
	const publicKeys = new Set(
		signerSets.flatMap((s) =>
			s.members.map((m) => m.publicKey),
		),
	);
	return [...publicKeys].some((publicKey) => {
		try {
			return (
				extractPublicKeyFromBase64(
					publicKey,
				).toSuiAddress() === address
			);
		} catch {
			return false;
		}
	});
}
