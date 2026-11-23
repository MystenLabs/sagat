// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { AccountSignerSet } from '@mysten/sagat/v1';

import { content } from '../content';
import {
	isMember,
	signerSetAddress,
} from './proposal-integrity';
import { sameAddress } from './sui-utils';
import { sumWeight, thresholdLabel } from './threshold';
import { type MultisigWithMembersForPublicKey } from './types';

type ListedPod = Pick<
	MultisigWithMembersForPublicKey,
	'address' | 'name' | 'originalSignerSet' | 'refused'
>;

/** The pod of the viewer's list at `address`, when its original signers make it up. */
function podAt<P extends ListedPod>(
	pods: readonly P[],
	address: string,
): P | null {
	return (
		pods.find(
			(pod) =>
				pod.refused !== 'signers' &&
				sameAddress(pod.address, address),
		) ?? null
	);
}

/** A pod of the viewer's list, as a signer set links to it. */
export interface LinkedPod {
	address: string;
	name: string | null;
}

export interface SignerSetCard {
	set: AccountSignerSet;
	/** The address the set's members and threshold make up. */
	address: string;
	isOriginal: boolean;
	/** The viewer's pod at `address`; null for the original set or a set that is no pod of theirs. */
	pod: LinkedPod | null;
}

/**
 * A card per acting signer set, the one `signerAddress` signs in first,
 * the rest in the given order. A set in `fresh` that makes up the same
 * address stands in for it, with newer answers and labels.
 */
export function signerSetCards({
	acting,
	fresh,
	account,
	pods,
	signerAddress,
}: {
	/** The sets that passed rule 2. */
	acting: readonly AccountSignerSet[];
	fresh: readonly AccountSignerSet[];
	/** The pod's own address. */
	account: string;
	pods: readonly ListedPod[];
	signerAddress: string | undefined;
}): SignerSetCard[] {
	const freshByAddress = fresh.map((set) => ({
		set,
		address: signerSetAddress(set),
	}));
	const cards = acting.flatMap((set): SignerSetCard[] => {
		const address = signerSetAddress(set);
		if (!address) return [];
		const isOriginal = sameAddress(address, account);
		const pod = isOriginal ? null : podAt(pods, address);
		return [
			{
				set:
					freshByAddress.find(
						(f) =>
							f.address && sameAddress(f.address, address),
					)?.set ?? set,
				address,
				isOriginal,
				pod: pod && {
					address: pod.address,
					name: pod.name,
				},
			},
		];
	});
	const viewer = signerAddress
		? cards.findIndex(({ set }) =>
				isMember(set, signerAddress),
			)
		: -1;
	return viewer > 0
		? [
				cards[viewer],
				...cards.filter((_, i) => i !== viewer),
			]
		: cards;
}

/** A row of the "Other signer sets" card. */
export interface OtherSignerSetRow {
	address: string;
	/** Set when the alias is the address of a pod in the viewer's list. */
	pod:
		| (LinkedPod & {
				/** "3 signers". */
				signers: string;
				/** "Threshold 2 of 3". */
				threshold: string;
		  })
		| null;
}

/** The aliases no acting set makes up, each with the viewer's pod at that address when there is one. */
export function otherSignerSetRows(
	unidentified: readonly string[],
	pods: readonly ListedPod[],
): OtherSignerSetRow[] {
	return unidentified.map((address) => {
		const pod = podAt(pods, address);
		if (!pod) return { address, pod: null };
		const { members, threshold } = pod.originalSignerSet;
		return {
			address,
			pod: {
				address: pod.address,
				name: pod.name,
				signers: content.common.signerCount(members.length),
				threshold: content.common.threshold(
					thresholdLabel({
						threshold,
						totalWeight: sumWeight(members),
					}),
				),
			},
		};
	});
}
