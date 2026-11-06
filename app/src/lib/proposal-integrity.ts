// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Checks a proposal's bytes against what the app can work out for itself
// before the wallet is asked to sign them.
import { normalizeSuiAddress } from '@mysten/sui/utils';

import { computeMultisigAddress } from './sui-utils';
import { readTransactionBytes } from './transaction-preview';
import { type ProposalCardInput } from './types';
import { extractPublicKeyFromBase64 } from './wallet';

/**
 * The first check a proposal failed: `unreadable`, the bytes don't
 * decode; `sender`, the bytes' sender isn't the account; `digest`, the
 * bytes' digest isn't the proposal's; `signers`, the account's signers
 * don't make up its address; `notSigner`, the connected wallet isn't one
 * of them.
 */
export type ProposalIntegrityFailure =
	| 'unreadable'
	| 'sender'
	| 'digest'
	| 'signers'
	| 'notSigner';

export type IntegrityProposal = Pick<
	ProposalCardInput,
	| 'transactionBytes'
	| 'digest'
	| 'multisigAddress'
	| 'multisig'
>;

const sameAddress = (a: string, b: string) =>
	normalizeSuiAddress(a) === normalizeSuiAddress(b);

/** The key's address, or null for a key that doesn't parse. */
function keyAddress(publicKey: string): string | null {
	try {
		return extractPublicKeyFromBase64(
			publicKey,
		).toSuiAddress();
	} catch {
		return null;
	}
}

/**
 * Whether `signerAddress` may sign the proposal's bytes, or the first
 * check it failed.
 */
export function checkProposalIntegrity(
	proposal: IntegrityProposal,
	signerAddress: string,
): ProposalIntegrityFailure | null {
	let read;
	try {
		read = readTransactionBytes(proposal.transactionBytes);
	} catch {
		return 'unreadable';
	}

	const account = proposal.multisigAddress;
	const sender = read.transaction.sender;
	if (
		!sender ||
		!sameAddress(sender, account) ||
		(proposal.multisig.address &&
			!sameAddress(sender, proposal.multisig.address))
	)
		return 'sender';

	if (read.digest !== proposal.digest) return 'digest';

	// A rotated account will instead need the rebuilt address to be in the
	// account's alias set, read from the app's own fullnode.
	const members = [...proposal.multisig.members].sort(
		(a, b) => a.order - b.order,
	);
	const { address: rebuilt } = computeMultisigAddress(
		members.map((m) => m.publicKey),
		members.map((m) => m.weight),
		proposal.multisig.threshold,
	);
	if (!rebuilt || !sameAddress(rebuilt, account))
		return 'signers';

	if (
		!members.some((m) => {
			const address = keyAddress(m.publicKey);
			return (
				address !== null &&
				sameAddress(address, signerAddress)
			);
		})
	)
		return 'notSigner';

	return null;
}
