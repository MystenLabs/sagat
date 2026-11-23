// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	Account,
	AccountSignerSet,
	KeyAnswer,
} from '@mysten/sagat/v1';

import { type AliasRead } from './alias-set';
import {
	checkAccountSigners,
	isMember,
	podActing,
	shownActingSets,
} from './proposal-integrity';
import { sumWeight } from './threshold';
import {
	type MultisigWithMembersForPublicKey,
	type PodChecks,
} from './types';

/** The signed-in key: its public key and the address it derives. */
type Signer = { publicKey: string; address: string };

/** The set `signerAddress` signs in: the first of `sets` that holds it, else `original`. */
export function viewerSignerSet(
	sets: readonly AccountSignerSet[],
	original: AccountSignerSet,
	signerAddress: string,
): AccountSignerSet {
	return (
		sets.find((set) => isMember(set, signerAddress)) ??
		original
	);
}

/** `publicKey`'s answer for the pod, from the sets shown as acting; null when none holds it. */
export function keyAnswer(
	account: Pick<Account, 'signerSets'>,
	publicKey: string,
): KeyAnswer | null {
	for (const set of shownActingSets(account)) {
		const member = set.members.find(
			(m) => m.publicKey === publicKey,
		);
		if (member) return member.answer;
	}
	return null;
}

/** The fields a row reads off the set the signed-in key signs in. */
function viewedThrough(
	set: AccountSignerSet,
	signer: Signer,
) {
	const answer = set.members.find(
		(member) => member.publicKey === signer.publicKey,
	)?.answer;
	return {
		threshold: set.threshold,
		members: set.members,
		totalWeight: sumWeight(set.members),
		isAccepted: answer === 'accepted',
		isRejected: answer === 'rejected',
		pendingMembers: set.members.filter(
			(member) => member.answer === 'invited',
		).length,
		rejectedMembers: set.members.filter(
			(member) => member.answer === 'rejected',
		).length,
	};
}

/** An account from the API as the signed-in key sees it, with rule 1 applied and rule 2 `checking`. */
export function toUserMultisig<A extends Account>(
	account: A,
	signer: Signer,
): A & MultisigWithMembersForPublicKey {
	const signers = checkAccountSigners(
		{
			original: account.originalSignerSet,
			shown: shownActingSets(account),
		},
		{
			account: account.address,
			signerAddress: signer.address,
		},
	);
	const checks: PodChecks =
		signers.kind === 'ok'
			? { refused: null, acting: { state: 'checking' } }
			: { refused: signers.kind, acting: null };
	return {
		...account,
		...viewedThrough(
			viewerSignerSet(
				account.signerSets,
				account.originalSignerSet,
				signer.address,
			),
			signer,
		),
		...checks,
	};
}

/**
 * The row with rule 2 from its alias read; a rule 1 refusal stands
 * whatever the node says. Once `ok`, the row reads the signed-in key's
 * set among the ones that passed.
 */
export function withActing(
	row: MultisigWithMembersForPublicKey,
	aliases: AliasRead | undefined,
	signer: Signer,
): MultisigWithMembersForPublicKey {
	if (
		row.refused === 'signers' ||
		row.refused === 'notSigner'
	)
		return row;
	const acting = podActing(
		shownActingSets(row),
		aliases,
		signer.address,
	);
	switch (acting.state) {
		case 'refused':
			return {
				...row,
				refused: 'notActing',
				acting: null,
				unidentified: acting.unidentified,
			};
		case 'ok':
			return {
				...row,
				...viewedThrough(
					viewerSignerSet(
						acting.signerSets,
						row.originalSignerSet,
						signer.address,
					),
					signer,
				),
				refused: null,
				acting: {
					state: 'ok',
					signerSets: acting.signerSets,
					unidentified: acting.unidentified,
				},
			};
		default:
			return {
				...row,
				refused: null,
				acting: { state: acting.state },
			};
	}
}
