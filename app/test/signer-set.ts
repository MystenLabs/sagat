// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';

import { type IdentifiedSignerSet } from '../src/lib/types';

/** A signer set of `keys` with weight 1 each, every key accepted. */
export function signerSet(
	keys: Ed25519Keypair[],
	threshold = 1,
): IdentifiedSignerSet {
	return {
		kind: 'signer_set',
		acting: true,
		original: true,
		address: MultiSigPublicKey.fromPublicKeys({
			threshold,
			publicKeys: keys.map((key) => ({
				publicKey: key.getPublicKey(),
				weight: 1,
			})),
		}).toSuiAddress(),
		threshold,
		members: keys.map((key, order) => ({
			publicKey: key.getPublicKey().toSuiPublicKey(),
			weight: 1,
			order,
			answer: 'accepted' as const,
			label: null,
		})),
	};
}
