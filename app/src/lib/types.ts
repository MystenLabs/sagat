// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigWithMembers } from '@mysten/sagat';

import { type SignersRefusedRule } from './signers-refused';

/** Rule 2 on the selected network for a pod that passed rule 1 and isn't refused by it. */
export type RowActing =
	| { state: 'checking' }
	| { state: 'unchecked' }
	/** `unidentified`: aliases no shown signer set rebuilds. */
	| { state: 'ok'; unidentified: string[] };

/** A refused pod carries no rule 2 state; one that isn't carries it. */
export type PodChecks =
	| {
			/** Why the pod failed a signers check: rule 1 (`signers`, `notSigner`) or rule 2 (`notActing`). */
			refused: SignersRefusedRule;
			acting: null;
	  }
	| { refused: null; acting: RowActing };

// Extended type that adds frontend-specific fields for displaying multisig state
// for a specific public key
export type MultisigWithMembersForPublicKey =
	MultisigWithMembers & {
		rejectedMembers: number;
		pendingMembers: number;
		isAccepted: boolean;
		isRejected: boolean;
	} & PodChecks;
