// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Executing a proposal happens in the client: pick a signer set that has
 * reached its threshold, rebuild its key, and combine only its members'
 * signatures (docs/migration-guide.md, "Executing a proposal").
 */

import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';

import {
	type ProposalSignature,
	type PublicSignerSetMember,
} from './types.js';

/** What the key of a signer set is built from. */
export interface SignerSetKeyInput {
	threshold: number;
	members: Pick<
		PublicSignerSetMember,
		'publicKey' | 'weight' | 'order'
	>[];
}

const orderedMembers = (signerSet: SignerSetKeyInput) =>
	[...signerSet.members].sort((a, b) => a.order - b.order);

/**
 * The multisig public key of a signer set: its members in `order`, with
 * their weights, and its threshold. Its address is the set's address.
 */
export function signerSetPublicKey(
	signerSet: SignerSetKeyInput,
): MultiSigPublicKey {
	return MultiSigPublicKey.fromPublicKeys({
		threshold: signerSet.threshold,
		publicKeys: orderedMembers(signerSet).map((m) => ({
			publicKey: publicKeyFromSuiBytes(m.publicKey),
			weight: m.weight,
		})),
	});
}

/**
 * The signature of a signer set over a transaction, combined from the
 * signatures of its members, in order. Signatures from keys outside the
 * set are left out: they would make the combination fail.
 */
export function combineSignerSetSignatures(
	signerSet: SignerSetKeyInput,
	signatures: Pick<
		ProposalSignature,
		'publicKey' | 'signature'
	>[],
): string {
	return signerSetPublicKey(
		signerSet,
	).combinePartialSignatures(
		orderedMembers(signerSet).flatMap(
			(m) =>
				signatures.find((s) => s.publicKey === m.publicKey)
					?.signature ?? [],
		),
	);
}
