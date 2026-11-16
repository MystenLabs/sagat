// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	parseSerializedSignature,
	type PublicKey,
} from '@mysten/sui/cryptography';
import {
	fromBase64,
	isValidSuiAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import {
	publicKeyFromSuiBytes,
	verifyPersonalMessageSignature,
	verifyTransactionSignature,
} from '@mysten/sui/verify';

import { PersonalMessages } from './constants.js';
import type {
	AccountEvent,
	Proposal,
	PublicProposal,
} from './types.js';

/**
 * `verified`: the proof checks out. `unverified`: there is no proof, or one
 * this SDK can't check. `invalid`: the proof doesn't match what it claims.
 */
export type ProofStatus =
	'verified' | 'unverified' | 'invalid';

export interface ProofResult {
	status: ProofStatus;
	/** The address of the key that signed, when the proof checked out. */
	signer: string | null;
	/** When the event was recorded, as an ISO timestamp. */
	createdAt: string | null;
}

export interface ProposalProofResult {
	/** The worst of `created` and `proposer`, or `verified` for a member. */
	status: ProofStatus;
	created: ProofResult;
	proposer: ProofResult;
}

/** Keys the caller trusts as the account's members, Sui-flagged base64. */
export type TrustedMembers = readonly {
	publicKey: string;
}[];

const PROPOSER_MESSAGES = {
	'proposer.added': {
		kind: 'proposer.add',
		message: PersonalMessages.addMultisigProposer,
	},
	'proposer.removed': {
		kind: 'proposer.remove',
		message: PersonalMessages.removeMultisigProposer,
	},
} as const;

// Schemes whose signatures verify without a network call.
const OFFLINE_SCHEMES = new Set([
	'ED25519',
	'Secp256k1',
	'Secp256r1',
]);

const RANK: Record<ProofStatus, number> = {
	verified: 0,
	unverified: 1,
	invalid: 2,
};

const result = (
	status: ProofStatus,
	event: AccountEvent | null | undefined,
	signer: string | null = null,
): ProofResult => ({
	status,
	signer: status === 'verified' ? signer : null,
	createdAt: event?.createdAt ?? null,
});

const worst = (a: ProofStatus, b: ProofStatus) =>
	RANK[a] >= RANK[b] ? a : b;

const toAddress = (value: unknown): string | null => {
	if (typeof value !== 'string') return null;
	try {
		const address = normalizeSuiAddress(value);
		return isValidSuiAddress(address) ? address : null;
	} catch {
		return null;
	}
};

const sameAddress = (a: unknown, b: unknown) => {
	const left = toAddress(a);
	return left !== null && left === toAddress(b);
};

const memberAddresses = (members: TrustedMembers) =>
	new Set(
		members.flatMap(({ publicKey }) => {
			try {
				return [
					publicKeyFromSuiBytes(publicKey).toSuiAddress(),
				];
			} catch {
				return [];
			}
		}),
	);

const isMember = (
	address: string,
	members: TrustedMembers,
) => {
	const normalized = toAddress(address);
	return (
		normalized !== null &&
		memberAddresses(members).has(normalized)
	);
};

// A v1 proof's signature, or null when the proof isn't one.
const v1Signature = (
	proof: AccountEvent['proof'],
	kind: string,
): string | null =>
	proof?.kind === kind &&
	proof.version === 1 &&
	typeof proof.signature === 'string' &&
	proof.signature.length > 0
		? proof.signature
		: null;

// The expiry as it was put into the signed text.
const expiryText = (expiry: unknown): string | null => {
	if (typeof expiry === 'string') return expiry;
	if (typeof expiry === 'number' && Number.isFinite(expiry))
		return String(expiry);
	return null;
};

// Null for a scheme that can't be checked offline; `invalid` when the
// signature is unreadable or doesn't verify.
const recoverSigner = async (
	signature: string,
	verify: () => Promise<PublicKey>,
): Promise<PublicKey | null | 'invalid'> => {
	try {
		const { signatureScheme } =
			parseSerializedSignature(signature);
		if (!OFFLINE_SCHEMES.has(signatureScheme)) return null;
		return await verify();
	} catch {
		return 'invalid';
	}
};

/**
 * Checks the signed proof of a `proposer.added` or `proposer.removed`
 * event against `accountAddress` and the `members` the caller trusts.
 * Never throws.
 */
export async function verifyAccountEvent(
	event: AccountEvent | null | undefined,
	{
		accountAddress,
		members,
	}: { accountAddress: string; members: TrustedMembers },
): Promise<ProofResult> {
	if (
		event?.action !== 'proposer.added' &&
		event?.action !== 'proposer.removed'
	)
		return result('unverified', event);
	const spec = PROPOSER_MESSAGES[event.action];

	const signature = v1Signature(event.proof, spec.kind);
	const expiry = expiryText(event.proof?.expiry);
	if (!signature || expiry === null || !event.subject)
		return result('unverified', event);

	const message = new TextEncoder().encode(
		spec.message(event.subject, accountAddress, expiry),
	);
	const signer = await recoverSigner(signature, () =>
		verifyPersonalMessageSignature(message, signature),
	);
	if (signer === null) return result('unverified', event);
	if (signer === 'invalid') return result('invalid', event);

	const address = signer.toSuiAddress();
	if (
		!sameAddress(address, event.actor) ||
		!isMember(address, members)
	)
		return result('invalid', event);
	return result('verified', event, address);
}

/**
 * Whether an account's proposer is vouched for: a member's address by
 * membership, anyone else by a `proposer.added` event for them that
 * verifies. Never throws.
 */
export async function verifyProposer({
	proposer,
	event,
	accountAddress,
	members,
}: {
	proposer: string;
	event: AccountEvent | null | undefined;
	accountAddress: string;
	members: TrustedMembers;
}): Promise<ProofResult> {
	if (isMember(proposer, members))
		return result('verified', null);
	if (!event) return result('unverified', event);

	const isAdd = event.action === 'proposer.added';
	if (
		(!isAdd && event.action !== 'proposer.removed') ||
		!sameAddress(event.subject, proposer)
	)
		return result('invalid', event);

	const checked = await verifyAccountEvent(event, {
		accountAddress,
		members,
	});
	// A removal never vouches, even one that verifies.
	return isAdd || checked.status === 'invalid'
		? checked
		: result('unverified', event);
}

/**
 * Checks a `proposal.created` event: the proposer's signature over the
 * proposal's transaction bytes, its signer and digest. Never throws.
 */
export async function verifyProposalCreated(
	event: AccountEvent | null | undefined,
	proposal: Pick<
		Proposal,
		'digest' | 'proposerAddress' | 'transactionBytes'
	>,
): Promise<ProofResult> {
	const signature =
		event?.action === 'proposal.created'
			? v1Signature(event.proof, 'proposal.create')
			: null;
	if (!event || !signature)
		return result('unverified', event);

	if (
		event.subject !== proposal.digest ||
		!sameAddress(event.actor, proposal.proposerAddress)
	)
		return result('invalid', event);

	const signer = await recoverSigner(signature, () =>
		verifyTransactionSignature(
			fromBase64(proposal.transactionBytes),
			signature,
		),
	);
	if (signer === null) return result('unverified', event);
	if (signer === 'invalid') return result('invalid', event);

	const address = signer.toSuiAddress();
	if (!sameAddress(address, event.actor))
		return result('invalid', event);
	return result('verified', event, address);
}

/**
 * Checks a proposal's proposer: a member by membership, anyone else by
 * both the proposal's `created` and newest `proposer` event. Never throws.
 */
export async function verifyProposalProposer(
	proposal: PublicProposal,
	{ members }: { members: TrustedMembers },
): Promise<ProposalProofResult> {
	const [created, proposer] = await Promise.all([
		verifyProposalCreated(
			proposal.events?.created,
			proposal,
		),
		verifyProposer({
			proposer: proposal.proposerAddress,
			event: proposal.events?.proposer,
			accountAddress: proposal.multisigAddress,
			members,
		}),
	]);
	const status = isMember(proposal.proposerAddress, members)
		? 'verified'
		: worst(created.status, proposer.status);
	return { status, created, proposer };
}
