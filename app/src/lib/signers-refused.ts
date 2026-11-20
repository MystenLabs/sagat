// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '../content';
import { networkLabel, type SuiNetwork } from './network';
import {
	type NetworkFailure,
	type ProposalIntegrityFailure,
} from './proposal-integrity';

/** `signers`, `notSigner`: rule 1 failed; `notActing`: rule 2 refused on the network. */
export type SignersRefusedRule =
	'signers' | 'notSigner' | 'notActing';

/** Why a pod's signers were refused, on `network`. */
export function signersRefusedLine(
	rule: SignersRefusedRule,
	network: SuiNetwork,
): string {
	const lines = content.common.signersRefused;
	return rule === 'notActing'
		? lines.notActing(networkLabel(network))
		: lines[rule];
}

/** Why Sign is refused: a failed check of the proposal, its network, or its proposer. */
export type SignRefusal =
	| ProposalIntegrityFailure
	| Exclude<NetworkFailure, 'unchecked'>
	| 'proposer';

export function signRefusedLine(
	refusal: SignRefusal,
	network: SuiNetwork,
): string {
	if (
		refusal === 'signers' ||
		refusal === 'notSigner' ||
		refusal === 'notActing'
	)
		return signersRefusedLine(refusal, network);
	if (refusal === 'chain') return content.common.wrongChain;
	return content.proposal.approvals.refused[refusal];
}

/** The line for a pod whose alias set on `network` couldn't be read. */
export function signersUncheckedLine(network: SuiNetwork) {
	return content.common.signersUnchecked.body(
		networkLabel(network),
	);
}

/** The pod's signers don't make up its address, the wallet isn't one of them, or no acting set on the network holds it. Nothing was signed. */
export class SignersRefusedError extends Error {
	constructor(
		rule: SignersRefusedRule,
		network: SuiNetwork,
	) {
		super(signersRefusedLine(rule, network));
		this.name = 'SignersRefusedError';
	}
}

/** The pod's alias set or the node's chain couldn't be read. Nothing was signed. */
export class SignersUncheckedError extends Error {
	constructor(network: SuiNetwork) {
		super(signersUncheckedLine(network));
		this.name = 'SignersUncheckedError';
	}
}
