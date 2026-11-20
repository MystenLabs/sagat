// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigWithMembers } from '@mysten/sagat';

import { type AliasRead } from './alias-set';
import {
	checkAccountSigners,
	podActing,
	shownActingSets,
} from './proposal-integrity';
import {
	type MultisigWithMembersForPublicKey,
	type PodChecks,
} from './types';

/** An account from the API as the signed-in key sees it, with rule 1 applied and rule 2 `checking`. */
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
	const checks: PodChecks =
		signers.kind === 'ok'
			? { refused: null, acting: { state: 'checking' } }
			: { refused: signers.kind, acting: null };
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
		...checks,
	};
}

/** The row with rule 2 from its alias read; a rule 1 refusal stands whatever the node says. */
export function withActing(
	row: MultisigWithMembersForPublicKey,
	aliases: AliasRead | undefined,
): MultisigWithMembersForPublicKey {
	if (
		row.refused === 'signers' ||
		row.refused === 'notSigner'
	)
		return row;
	const acting = podActing(shownActingSets(row), aliases);
	switch (acting.state) {
		case 'refused':
			return { ...row, refused: 'notActing', acting: null };
		case 'ok':
			return {
				...row,
				refused: null,
				acting: {
					state: 'ok',
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
