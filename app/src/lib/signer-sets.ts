// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '../content';
import { joinList } from './create-multisig';
import { networkLabel, type SuiNetwork } from './network';
import {
	originalSignerSet,
	signerSetAddress,
} from './proposal-integrity';
import { sameAddress } from './sui-utils';
import { approvalsThresholdLabel } from './threshold';
import {
	type IdentifiedSignerSet,
	type MultisigWithMembersForPublicKey,
} from './types';
import { viewerSignerSet } from './user-multisig';

export type ListedPod = Pick<
	MultisigWithMembersForPublicKey,
	'address' | 'name' | 'signerSets' | 'refused'
>;

/** The pod of the viewer's list at `address`, when its original signers make it up. */
export function podAt<P extends ListedPod>(
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

interface LinkedPod {
	address: string;
	name: string | null;
}

export interface SignerSetCard {
	set: IdentifiedSignerSet;
	/** The address the set's members and threshold make up. */
	address: string;
	isOriginal: boolean;
	/** The viewer's pod at `address`; null for the original set or a set that is no pod of theirs. */
	pod: LinkedPod | null;
}

/** A card per acting set, the viewer's (`viewerSignerSet`) first; a `fresh` set making up the same address stands in for it. */
export function signerSetCards({
	acting,
	fresh,
	account,
	pods,
	signerAddress,
}: {
	/** The sets that passed rule 2. */
	acting: readonly IdentifiedSignerSet[];
	fresh: readonly IdentifiedSignerSet[];
	account: string;
	pods: readonly ListedPod[];
	signerAddress: string | undefined;
}): SignerSetCard[] {
	const freshByAddress = fresh.map((set) => ({
		set,
		address: signerSetAddress(set),
	}));
	const viewers = signerAddress
		? viewerSignerSet(acting, account, signerAddress)
		: undefined;
	const ordered = viewers
		? [viewers, ...acting.filter((set) => set !== viewers)]
		: acting;
	return ordered.flatMap((set): SignerSetCard[] => {
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
}

export function differentSignersLine(
	networks: readonly SuiNetwork[],
): string | null {
	return networks.length > 0
		? content.signers.differentOn(
				joinList(networks.map(networkLabel), 'and'),
			)
		: null;
}

export interface OtherSignerSetRow {
	address: string;
	/** Set when the alias is the address of a pod in the viewer's list. */
	pod:
		| (LinkedPod & {
				signers: string;
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
		const set = originalSignerSet(pod);
		return {
			address,
			pod: {
				address: pod.address,
				name: pod.name,
				signers: content.common.signerCount(
					set.members.length,
				),
				threshold: approvalsThresholdLabel(set),
			},
		};
	});
}
