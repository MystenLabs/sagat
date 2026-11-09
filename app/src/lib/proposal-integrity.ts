// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Checks a proposal's bytes against what the app can work out for itself
// before the wallet is asked to sign them.
import { type PublicProposal } from '@mysten/sagat';

import {
	computeMultisigAddress,
	sameAddress,
	validatePublicKey,
} from './sui-utils';
import { readTransactionBytes } from './transaction-preview';

/**
 * The first check a proposal failed: `unreadable`, the bytes don't
 * decode; `sender`, the bytes' sender isn't the account; `gasOwner`, the
 * bytes set a gas owner other than the account; `digest`, the bytes'
 * digest isn't the proposal's or the one the viewer opened; `signers`,
 * the account's signers don't make up its address; `notSigner`, the
 * connected wallet isn't one of them.
 */
export type ProposalIntegrityFailure =
	| 'unreadable'
	| 'sender'
	| 'gasOwner'
	| 'digest'
	| 'signers'
	| 'notSigner';

export type IntegrityProposal = Pick<
	PublicProposal,
	| 'transactionBytes'
	| 'digest'
	| 'multisigAddress'
	| 'multisig'
>;

/**
 * Whether `signerAddress` may sign the proposal's bytes, or the first
 * check it failed. `openedDigest` is the digest the viewer opened, from
 * the page's URL, not from the response.
 */
export function checkProposalIntegrity(
	proposal: IntegrityProposal,
	{
		openedDigest,
		signerAddress,
	}: { openedDigest: string; signerAddress: string },
): ProposalIntegrityFailure | null {
	let read;
	try {
		read = readTransactionBytes(proposal.transactionBytes);
	} catch {
		return 'unreadable';
	}

	const account = proposal.multisigAddress;
	const { sender, gasData } = read.transaction;
	if (
		!sender ||
		!sameAddress(sender, account) ||
		(proposal.multisig.address &&
			!sameAddress(sender, proposal.multisig.address))
	)
		return 'sender';

	// Any other gas owner signs as the sponsor: when that's the signer, one
	// signature would also give away their gas coins.
	if (gasData.owner && !sameAddress(gasData.owner, account))
		return 'gasOwner';

	if (
		read.digest !== proposal.digest ||
		read.digest !== openedDigest
	)
		return 'digest';

	const signers = checkAccountSigners(proposal.multisig, {
		account,
		signerAddress,
	});
	return signers.kind === 'ok' ? null : signers.kind;
}

/** The signers and threshold an account's address is made from. */
export type AccountSigners = Pick<
	PublicProposal['multisig'],
	'threshold' | 'members'
>;

/**
 * Rebuilds `account` from its signers and threshold. `signers`, they
 * don't make up `account`; `notSigner`, `signerAddress` isn't one of
 * them; otherwise `address` is the rebuilt address.
 */
export function checkAccountSigners(
	multisig: AccountSigners,
	{
		account,
		signerAddress,
	}: { account: string; signerAddress: string },
):
	| { kind: 'ok'; address: string }
	| { kind: 'signers' | 'notSigner' } {
	// A rotated account will instead need the rebuilt address to be in the
	// account's alias set, read from the app's own fullnode.
	const members = [...multisig.members].sort(
		(a, b) => a.order - b.order,
	);
	const { address: rebuilt } = computeMultisigAddress(
		members.map((m) => m.publicKey),
		members.map((m) => m.weight),
		multisig.threshold,
	);
	if (!rebuilt || !sameAddress(rebuilt, account))
		return { kind: 'signers' };

	if (
		!members.some((m) => {
			const { address } = validatePublicKey(m.publicKey);
			return (
				address !== undefined &&
				sameAddress(address, signerAddress)
			);
		})
	)
		return { kind: 'notSigner' };

	return { kind: 'ok', address: rebuilt };
}
