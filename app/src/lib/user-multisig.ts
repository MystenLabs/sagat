// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	Account,
	AccountList,
	KeyAnswer,
	RemovedAccount,
} from '@mysten/sagat/v1';

import { type AliasRead } from './alias-set';
import {
	checkPodSigners,
	isMember,
	originalSignerSet,
	podActing,
	shownActingSets,
	signerSetAddress,
	type ShownPod,
} from './proposal-integrity';
import { sameAddress } from './sui-utils';
import { sumWeight } from './threshold';
import {
	type IdentifiedSignerSet,
	type MultisigWithMembersForPublicKey,
	type PodChecks,
} from './types';

type Signer = { publicKey: string; address: string };

/** The set of `sets` holding `signerAddress`: the pod's own (making up `account`) when it does, else the first that does. */
export function viewerSignerSet(
	sets: readonly IdentifiedSignerSet[],
	account: string,
	signerAddress: string,
): IdentifiedSignerSet | undefined {
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

/** `publicKey`'s answer for the pod, from the sets shown as acting that the API reports acting; null when none holds it. */
export function keyAnswer(
	account: ShownPod,
	publicKey: string,
): KeyAnswer | null {
	for (const set of shownActingSets(account)) {
		if (!set.acting) continue;
		const answer = memberAnswer(set, publicKey);
		if (answer) return answer;
	}
	return null;
}

/** The pods `publicKey` is no longer a signer of: listed as removed, or held only in sets the API reports as not acting. */
export function noLongerSignerOf(
	list: Pick<AccountList, 'accounts' | 'removed'>,
	publicKey: string,
): string[] {
	const heldOnlyByOldSets = list.accounts
		.filter(
			(account) =>
				keyAnswer(account, publicKey) === null &&
				shownActingSets(account).some((set) =>
					memberAnswer(set, publicKey),
				),
		)
		.map((account) => account.address);
	return [
		...list.removed
			.filter((pod) => pod.publicKey === publicKey)
			.map((pod) => pod.address),
		...heldOnlyByOldSets,
	];
}

function memberAnswer(
	set: Pick<IdentifiedSignerSet, 'members'>,
	publicKey: string,
): KeyAnswer | null {
	return (
		set.members.find((m) => m.publicKey === publicKey)
			?.answer ?? null
	);
}

function viewedThrough(
	set: Pick<IdentifiedSignerSet, 'threshold' | 'members'>,
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
	};
}

/** An account from the API as the signed-in key sees it, with rule 1 applied and rule 2 `checking`. */
export function toUserMultisig<A extends Account>(
	account: A,
	signer: Signer,
): A & MultisigWithMembersForPublicKey {
	const signers = checkPodSigners(account, signer.address);
	const checks: PodChecks =
		signers.kind === 'ok'
			? { refused: null, acting: { state: 'checking' } }
			: { refused: signers.kind, acting: null };
	return {
		...account,
		...viewedThrough(
			originalSignerSet(account),
			keyAnswer(account, signer.publicKey),
		),
		...checks,
	};
}

/** The rows of the accounts where the signed-in key's answer is `answer`. */
export function rowsAnswered<A extends Account>(
	accounts: readonly A[],
	signer: Signer,
	answer: KeyAnswer,
) {
	return accounts
		.filter(
			(account) =>
				keyAnswer(account, signer.publicKey) === answer,
		)
		.map((account) => toUserMultisig(account, signer));
}

/** The row with rule 2 from its alias read; a rule 1 refusal stands whatever the node says. */
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
				) ?? originalSignerSet(row);
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

/** The account query's fresher copy of a listed row, under the row's checks. */
export function withListedChecks(
	listed: MultisigWithMembersForPublicKey,
	details: MultisigWithMembersForPublicKey | undefined,
): MultisigWithMembersForPublicKey {
	if (
		!details ||
		!sameAddress(details.address, listed.address)
	)
		return listed;
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
	// Threshold and members stay from the sets that passed rule 2.
	return {
		...details,
		threshold: listed.threshold,
		members: listed.members,
		totalWeight: listed.totalWeight,
		pendingMembers: listed.pendingMembers,
		refused: null,
		acting: listed.acting,
	};
}

/** The newest removal of `publicKey` from each pod, when it is newer than `seen` and names its transaction. */
export function removalsToTell(
	removed: RemovedAccount[],
	publicKey: string,
	seen: number,
) {
	const newest = new Map<string, RemovedAccount>();
	for (const pod of removed)
		if (
			pod.publicKey === publicKey &&
			pod.eventId > (newest.get(pod.address)?.eventId ?? -1)
		)
			newest.set(pod.address, pod);
	return [...newest.values()].filter(
		(pod) => pod.transactionDigest && pod.eventId > seen,
	);
}
