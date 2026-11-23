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
	signerSetAddress,
	type ShownPod,
} from './proposal-integrity';
import { sameAddress } from './sui-utils';
import { sumWeight } from './threshold';
import {
	type MultisigWithMembersForPublicKey,
	type PodChecks,
} from './types';

/** The signed-in key: its public key and the address it derives. */
type Signer = { publicKey: string; address: string };

/** The set of `sets` holding `signerAddress`: the pod's own (making up `account`) when it does, else the first that does. */
export function viewerSignerSet(
	sets: readonly AccountSignerSet[],
	account: string,
	signerAddress: string,
): AccountSignerSet | undefined {
	const holding = sets.filter((set) =>
		isMember(set, signerAddress),
	);
	return (
		holding.find((set) => {
			const address = signerSetAddress(set);
			return (
				address !== null && sameAddress(address, account)
			);
		}) ?? holding[0]
	);
}

/** `publicKey`'s answer for the pod, from the sets shown as acting; null when none holds it. */
export function keyAnswer(
	account: ShownPod,
	publicKey: string,
): KeyAnswer | null {
	for (const set of shownActingSets(account)) {
		const answer = memberAnswer(set, publicKey);
		if (answer) return answer;
	}
	return null;
}

function memberAnswer(
	set: AccountSignerSet,
	publicKey: string,
): KeyAnswer | null {
	return (
		set.members.find((m) => m.publicKey === publicKey)
			?.answer ?? null
	);
}

/** The fields a row reads off a signer set, with the signed-in key's `answer`. */
function viewedThrough(
	set: AccountSignerSet,
	answer: KeyAnswer | null,
) {
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

/**
 * An account from the API as the signed-in key sees it, with rule 1
 * applied and rule 2 `checking`. Until rule 2 passes, the row reads the
 * original set; the key's answer is from whichever shown set holds it.
 */
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
			account.originalSignerSet,
			keyAnswer(account, signer.publicKey),
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
		case 'ok': {
			const set =
				viewerSignerSet(
					acting.signerSets,
					row.address,
					signer.address,
				) ?? row.originalSignerSet;
			return {
				...row,
				...viewedThrough(
					set,
					memberAnswer(set, signer.publicKey),
				),
				refused: null,
				acting: {
					state: 'ok',
					signerSets: acting.signerSets,
					unidentified: acting.unidentified,
				},
			};
		}
		default:
			return {
				...row,
				refused: null,
				acting: { state: acting.state },
			};
	}
}

/**
 * The account query's fresher copy of a listed row, under the row's
 * checks. Once rule 2 passed, the threshold and members stay the row's,
 * from the sets that passed.
 */
export function withListedChecks(
	listed: MultisigWithMembersForPublicKey,
	details: MultisigWithMembersForPublicKey | undefined,
): MultisigWithMembersForPublicKey {
	if (!details) return listed;
	if (listed.refused)
		return {
			...details,
			refused: listed.refused,
			acting: null,
		};
	if (listed.acting.state !== 'ok')
		return {
			...details,
			refused: null,
			acting: listed.acting,
		};
	return {
		...details,
		threshold: listed.threshold,
		members: listed.members,
		totalWeight: listed.totalWeight,
		pendingMembers: listed.pendingMembers,
		rejectedMembers: listed.rejectedMembers,
		refused: null,
		acting: listed.acting,
	};
}
