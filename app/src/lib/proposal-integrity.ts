// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Checks a proposal's bytes against what the app can work out for itself
// before the wallet is asked to sign them.
import { type PublicProposal } from '@mysten/sagat';

import { type AliasRead } from './alias-set';
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
	const rebuilt = rebuildAccount(multisig, account);
	if (!rebuilt) return { kind: 'signers' };

	if (!isMember(multisig, signerAddress))
		return { kind: 'notSigner' };

	return { kind: 'ok', address: rebuilt };
}

/** Whether `signerAddress` is one of the set's members. */
export function isMember(
	set: AccountSigners,
	signerAddress: string,
): boolean {
	return set.members.some((m) => {
		const { address } = validatePublicKey(m.publicKey);
		return (
			address !== undefined &&
			sameAddress(address, signerAddress)
		);
	});
}

/** The address a signer set's members and threshold make up, or null when they make none. */
export function signerSetAddress(
	set: AccountSigners,
): string | null {
	const members = [...set.members].sort(
		(a, b) => a.order - b.order,
	);
	return computeMultisigAddress(
		members.map((m) => m.publicKey),
		members.map((m) => m.weight),
		set.threshold,
	).address;
}

// Rule 1: the original signer set rebuilds the pod's address.

/**
 * The address `multisig`'s signers and threshold make up, or null when
 * it isn't `account`.
 */
export function rebuildAccount(
	multisig: AccountSigners,
	account: string,
): string | null {
	const rebuilt = signerSetAddress(multisig);
	return rebuilt && sameAddress(rebuilt, account)
		? rebuilt
		: null;
}

// Rule 2: every set shown as acting rebuilds to an alias of the pod.

/** Rule 2 for the signer sets shown as acting, against the pod's alias set on one network. */
export type ActingSetsCheck<
	S extends AccountSigners = AccountSigners,
> =
	| { kind: 'unchecked' }
	| {
			kind: 'checked';
			/** Shown sets whose rebuilt address is an alias. */
			acting: { set: S; address: string }[];
			/** Shown sets that are no alias: they must not be shown as acting. */
			refused: S[];
			/** Aliases that no shown set rebuilds. */
			unidentified: string[];
	  };

export function checkActingSets<S extends AccountSigners>(
	shown: readonly S[],
	aliases: AliasRead,
): ActingSetsCheck<S> {
	if (aliases.kind === 'failed')
		return { kind: 'unchecked' };

	const acting: { set: S; address: string }[] = [];
	const refused: S[] = [];
	for (const set of shown) {
		const address = signerSetAddress(set);
		if (
			address &&
			aliases.aliases.some((alias) =>
				sameAddress(alias, address),
			)
		)
			acting.push({ set, address });
		else refused.push(set);
	}
	const unidentified = aliases.aliases.filter(
		(alias) =>
			!acting.some(({ address }) =>
				sameAddress(address, alias),
			),
	);
	return { kind: 'checked', acting, refused, unidentified };
}

/** `ok`: every shown set is an alias; `refused`: one isn't, or none is shown; `unchecked`: couldn't read. */
export function actingVerdict(
	check: ActingSetsCheck,
): 'ok' | 'refused' | 'unchecked' {
	if (check.kind === 'unchecked') return 'unchecked';
	return check.refused.length > 0 ||
		check.acting.length === 0
		? 'refused'
		: 'ok';
}

/** The signer sets a pod's response shows as acting: today the one composition it carries. */
export function shownActingSets(
	multisig: AccountSigners,
): AccountSigners[] {
	return [multisig];
}

/** Rule 2 for a pod on one network; `checking` until its alias set is read. */
export interface PodActing {
	state: 'checking' | 'ok' | 'refused' | 'unchecked';
	/** Aliases no shown set rebuilds. Empty unless `ok`. */
	unidentified: string[];
}

export function podActing(
	shown: readonly AccountSigners[],
	aliases: AliasRead | undefined,
): PodActing {
	if (!aliases)
		return { state: 'checking', unidentified: [] };
	const check = checkActingSets(shown, aliases);
	const state = actingVerdict(check);
	return {
		state,
		unidentified:
			state === 'ok' && check.kind === 'checked'
				? check.unidentified
				: [],
	};
}

/** What the app's node says about a pod on one network. */
export interface NodeFacts {
	aliases: AliasRead;
	/** The node's chain identifier, null when it couldn't be read. */
	chain: string | null;
}

/** `chain`: the bytes name another chain; `unchecked`: the node couldn't be read; `notActing`: no acting set holds the wallet's key. */
export type NetworkFailure =
	'chain' | 'unchecked' | 'notActing';

/** Whether `signerAddress` may sign for the pod on one network, or why not. */
export function checkSignerOnNetwork({
	shown,
	signerAddress,
	namedChain,
	node,
}: {
	/** The signer sets shown as acting. */
	shown: readonly AccountSigners[];
	signerAddress: string;
	/** The chain the bytes name, null when they name none. */
	namedChain: string | null;
	node: NodeFacts;
}): NetworkFailure | null {
	if (namedChain && node.chain && namedChain !== node.chain)
		return 'chain';
	if (namedChain && !node.chain) return 'unchecked';
	const check = checkActingSets(shown, node.aliases);
	if (check.kind === 'unchecked') return 'unchecked';
	return check.acting.some(({ set }) =>
		isMember(set, signerAddress),
	)
		? null
		: 'notActing';
}
