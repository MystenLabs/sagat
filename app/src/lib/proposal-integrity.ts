// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Checks a proposal's bytes against what the app can work out for itself
// before the wallet is asked to sign them.
import type {
	Account,
	Proposal,
	ProposalList,
	SignerSet,
} from '@mysten/sagat/v1';

import { type AliasRead } from './alias-set';
import {
	computeMultisigAddress,
	sameAddress,
	validatePublicKey,
} from './sui-utils';
import { readTransactionBytes } from './transaction-preview';
import { type IdentifiedSignerSet } from './types';

/**
 * The first check a proposal failed: `unreadable`, the bytes don't
 * decode; `sender`, the bytes' sender isn't the account, or the proposal
 * names another account; `gasOwner`, the bytes set a gas owner other than
 * the account; `digest`, the bytes'
 * digest isn't the proposal's or the one the viewer opened; `signers`,
 * the account's original signers don't make up its address;
 * `notSigner`, the connected wallet is in none of the proposal's signer
 * sets.
 */
export type ProposalIntegrityFailure =
	| 'unreadable'
	| 'sender'
	| 'gasOwner'
	| 'digest'
	| 'signers'
	| 'notSigner';

/** A `/v1` proposal whose `signerSets` are only the sets that act; the others are apart, there only to rebuild the pod's address. */
export type AppProposal = Proposal & {
	notActingSets: SignerSet[];
};

export type AppProposalList = Omit<
	ProposalList,
	'proposals'
> & { proposals: AppProposal[] };

export function actingOnly(
	proposal: Proposal,
): AppProposal {
	return {
		...proposal,
		signerSets: proposal.signerSets.filter(
			(set) => set.acting,
		),
		notActingSets: proposal.signerSets.filter(
			(set) => !set.acting,
		),
	};
}

export type IntegrityProposal = Pick<
	AppProposal,
	| 'transactionBytes'
	| 'digest'
	| 'accountAddress'
	| 'signerSets'
	| 'notActingSets'
>;

/** Whether `signerAddress` may sign the bytes for `pod` (else the proposal's own address), or the first check it failed. */
export function checkProposalIntegrity(
	proposal: IntegrityProposal,
	{
		pod,
		openedDigest,
		signerAddress,
		newSets = [],
	}: {
		pod: ShownPod | null;
		openedDigest: string;
		signerAddress: string;
		/** The new sets of the signer change the bytes make, checked against the node's alias set: their members may sign it too. */
		newSets?: readonly SetMembers[];
	},
): ProposalIntegrityFailure | null {
	let read;
	try {
		read = readTransactionBytes(proposal.transactionBytes);
	} catch {
		return 'unreadable';
	}

	const account = pod?.address ?? proposal.accountAddress;
	if (!sameAddress(proposal.accountAddress, account))
		return 'sender';
	const { sender, gasData } = read.transaction;
	if (!sender || !sameAddress(sender, account))
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

	const original = pod
		? originalSignerSet(pod)
		: // Trusted because it rebuilds the address, whatever its flags.
			[
				...proposal.signerSets,
				...proposal.notActingSets,
			].find((set) => rebuildAccount(set, account));
	if (!original) return 'signers';
	const signers = checkAccountSigners(
		{ original, shown: proposal.signerSets },
		{ account, signerAddress },
	);
	if (
		signers.kind === 'notSigner' &&
		newSets.some((set) => isMember(set, signerAddress))
	)
		return null;
	return signers.kind === 'ok' ? null : signers.kind;
}

/** The signers and threshold an account's address is made from. */
export type AccountSigners = Pick<
	SignerSet,
	'threshold' | 'members'
>;

/**
 * Rebuilds `account` from its original signer set. `signers`, it
 * doesn't make up `account`; `notSigner`, `signerAddress` is in none of
 * the `shown` sets.
 */
export function checkAccountSigners(
	{
		original,
		shown,
	}: {
		original: AccountSigners;
		shown: readonly AccountSigners[];
	},
	{
		account,
		signerAddress,
	}: { account: string; signerAddress: string },
): { kind: 'ok' | 'signers' | 'notSigner' } {
	if (!rebuildAccount(original, account))
		return { kind: 'signers' };

	if (!shown.some((set) => isMember(set, signerAddress)))
		return { kind: 'notSigner' };

	return { kind: 'ok' };
}

/** A signer set's keys, whatever else it carries. */
export type SetMembers = {
	members: readonly { publicKey: string }[];
};

/** Whether `signerAddress` is one of the set's members. */
export function isMember(
	set: SetMembers,
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

/** The signer sets a proposal counts against: aliases in `aliases`, or only the one making up `account` while unread. */
export function checkedSignerSets<S extends AccountSigners>(
	signerSets: readonly S[],
	account: string,
	aliases: AliasRead | undefined,
): { set: S; address: string }[] {
	const check = aliases
		? checkActingSets(signerSets, aliases)
		: null;
	if (check?.kind === 'checked') return check.acting;
	return signerSets.flatMap((set) => {
		const address = rebuildAccount(set, account);
		return address ? [{ set, address }] : [];
	});
}

/** Whether a fresh alias read no longer holds the signer set at `address`; false when the read failed. */
export function signerSetRemoved(
	address: string,
	aliases: AliasRead,
): boolean {
	return (
		aliases.kind === 'read' &&
		!aliases.aliases.some((alias) =>
			sameAddress(alias, address),
		)
	);
}

export type ShownPod = Pick<
	Account,
	'address' | 'signerSets'
>;

/** A pod's sets that carry members, by address as the API used to list them. */
export function shownActingSets(
	pod: Pick<Account, 'signerSets'>,
): IdentifiedSignerSet[] {
	return pod.signerSets
		.filter(
			(set): set is IdentifiedSignerSet =>
				set.kind !== 'unknown',
		)
		.sort((a, b) => (a.address < b.address ? -1 : 1));
}

/** The set at the pod's address; without one, a set that makes up no address. */
export function originalSignerSet(
	pod: ShownPod,
): Pick<IdentifiedSignerSet, 'threshold' | 'members'> {
	return (
		shownActingSets(pod).find((set) =>
			sameAddress(set.address, pod.address),
		) ?? { threshold: 0, members: [] }
	);
}

/** Rule 1 for a `/v1` pod: its original set against its own address. */
export function checkPodSigners(
	pod: ShownPod,
	signerAddress: string,
) {
	return checkAccountSigners(
		{
			original: originalSignerSet(pod),
			shown: shownActingSets(pod),
		},
		{ account: pod.address, signerAddress },
	);
}

/** Rule 2 for a pod on one network; `checking` until its alias set is read. */
interface PodActing<
	S extends AccountSigners = AccountSigners,
> {
	state: 'checking' | 'ok' | 'refused' | 'unchecked';
	/** Shown sets that rebuild to an alias. Empty unless `ok`. */
	signerSets: S[];
	/** Aliases no shown set rebuilds. Empty unless `ok`, or `refused` with no shown set an alias. */
	unidentified: string[];
}

/** `ok` when a shown set that is an alias holds `signerAddress`; `refused` when none does. */
export function podActing<S extends AccountSigners>(
	shown: readonly S[],
	aliases: AliasRead | undefined,
	signerAddress: string,
): PodActing<S> {
	const none = { signerSets: [], unidentified: [] };
	if (!aliases) return { state: 'checking', ...none };
	const check = checkActingSets(shown, aliases);
	if (check.kind === 'unchecked')
		return { state: 'unchecked', ...none };
	if (
		!check.acting.some(({ set }) =>
			isMember(set, signerAddress),
		)
	)
		return {
			state: 'refused',
			signerSets: [],
			unidentified:
				check.acting.length === 0 ? check.unidentified : [],
		};
	return {
		state: 'ok',
		signerSets: check.acting.map(({ set }) => set),
		unidentified: check.unidentified,
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
	newSets = [],
}: {
	/** The signer sets shown as acting. */
	shown: readonly AccountSigners[];
	signerAddress: string;
	/** The chain the bytes name, null when they name none. */
	namedChain: string | null;
	node: NodeFacts;
	/** As `checkProposalIntegrity`'s: a checked signer change's new sets. */
	newSets?: readonly SetMembers[];
}): NetworkFailure | null {
	if (namedChain && node.chain && namedChain !== node.chain)
		return 'chain';
	if (namedChain && !node.chain) return 'unchecked';
	const check = checkActingSets(shown, node.aliases);
	if (check.kind === 'unchecked') return 'unchecked';
	return check.acting.some(({ set }) =>
		isMember(set, signerAddress),
	) || newSets.some((set) => isMember(set, signerAddress))
		? null
		: 'notActing';
}
