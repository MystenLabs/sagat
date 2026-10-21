// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	Account,
	SignerSetWithMembers,
} from '@mysten/sagat';

import type { KeyMembership } from './types';

/**
 * The signer set the account was created with: the one at the account's own
 * address. Until rotation ships it is an account's only signer set, and the
 * screens show it. After a rotation the account keeps its address but other
 * sets sign for it, so the screens will need to pick per network.
 */
export function getOriginalSignerSet(
	account: Pick<Account, 'address' | 'signerSets'>,
): SignerSetWithMembers | undefined {
	return account.signerSets.find(
		(signerSet) => signerSet.address === account.address,
	);
}

// `publicKey`'s answer in `signerSet`, with the counts the cards show.
// Undefined when the key is not a member.
export function getKeyMembership(
	signerSet: SignerSetWithMembers,
	publicKey: string,
): KeyMembership | undefined {
	const member = signerSet.members.find(
		(m) => m.publicKey === publicKey,
	);
	if (!member) return undefined;
	return {
		isAccepted: member.isAccepted,
		isRejected: member.isRejected,
		pendingMembers: signerSet.members.filter(
			(m) => !m.isAccepted && !m.isRejected,
		).length,
		rejectedMembers: signerSet.members.filter(
			(m) => m.isRejected,
		).length,
	};
}
