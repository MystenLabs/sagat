// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	Account,
	AccountMember,
	AccountSignerSet,
} from '@mysten/sagat/v1';

import { type SignersRefusedRule } from './signers-refused';

/** An entry of an account's `signerSets` that carries members. */
export type IdentifiedSignerSet = Exclude<
	AccountSignerSet,
	{ kind: 'unknown' }
>;

/** Rule 2 on the selected network for a pod that passed rule 1 and isn't refused by it. */
export type RowActing =
	| { state: 'checking' }
	| { state: 'unchecked' }
	| {
			state: 'ok';
			/** The shown sets that rebuild to an alias on the app's node. */
			signerSets: IdentifiedSignerSet[];
			/** Aliases no shown signer set rebuilds. */
			unidentified: string[];
	  };

/** A refused pod carries no rule 2 state; one that isn't carries it. */
export type PodChecks =
	| {
			/** Why the pod failed a signers check: rule 1 (`signers`, `notSigner`) or rule 2 (`notActing`). */
			refused: SignersRefusedRule;
			acting: null;
			/** For `notActing` when no shown set is an alias: the node's aliases. */
			unidentified?: string[];
	  }
	| { refused: null; acting: RowActing };

/** A pod as the signed-in key sees it; `threshold` and `members` are the original set's until rule 2 is `ok`. */
export type MultisigWithMembersForPublicKey = Account & {
	threshold: number;
	members: AccountMember[];
	totalWeight: number;
	pendingMembers: number;
	isAccepted: boolean;
	isRejected: boolean;
} & PodChecks;
