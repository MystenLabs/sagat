// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigWithMembers } from '@mysten/sagat';

import { checkAccountSigners } from './proposal-integrity';
import { type MultisigWithMembersForPublicKey } from './types';

/**
 * An account from the API as the signed-in key sees it. `refused` is set
 * when the address isn't rebuilt from its signers and threshold, or the
 * wallet isn't one of them.
 */
export function toUserMultisig(
	m: MultisigWithMembers,
	signer: { publicKey: string; address: string },
): MultisigWithMembersForPublicKey {
	const currentMember = m.members.find(
		(member) => member.publicKey === signer.publicKey,
	);
	const signers = checkAccountSigners(m, {
		account: m.address,
		signerAddress: signer.address,
	});
	return {
		...m,
		isAccepted: currentMember?.isAccepted ?? false,
		isRejected: currentMember?.isRejected ?? false,
		pendingMembers: m.members.filter(
			(member) => !member.isAccepted && !member.isRejected,
		).length,
		rejectedMembers: m.members.filter(
			(member) => member.isRejected,
		).length,
		refused: signers.kind === 'ok' ? null : signers.kind,
	};
}
