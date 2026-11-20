// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	parseSerializedSignature,
	type PublicKey,
} from '@mysten/sui/cryptography';
import { TransactionDataBuilder } from '@mysten/sui/transactions';
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

/** `unverified`: no proof, or one this SDK can't check; `invalid`: it doesn't match. */
export type ProofStatus =
	'verified' | 'unverified' | 'invalid';

export interface ProofResult {
	status: ProofStatus;
	/** The address of the key that signed, when the proof checked out. */
	signer: string | null;
	/** When the event was recorded, as an ISO timestamp. */
	createdAt: string | null;
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

const ANSWER_MESSAGES = {
	'account.accepted': {
		kind: 'account.accept',
		message: PersonalMessages.acceptAccountInvitation,
	},
	'account.rejected': {
		kind: 'account.reject',
		message: PersonalMessages.rejectAccountInvitation,
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

// A verifier that throws reports the proof as invalid.
const failClosed = async <R>(
	check: () => Promise<R>,
	onThrow: () => R,
): Promise<R> => {
	try {
		return await check();
	} catch {
		return onThrow();
	}
};

const invalid = () => result('invalid', null);

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

const keyAddress = (publicKey: unknown): string | null => {
	if (typeof publicKey !== 'string') return null;
	try {
		return publicKeyFromSuiBytes(publicKey).toSuiAddress();
	} catch {
		return null;
	}
};

const memberAddresses = (members: TrustedMembers) =>
	new Set(
		members.flatMap(
			({ publicKey }) => keyAddress(publicKey) ?? [],
		),
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
const expiryText = (expiry: unknown): string | null =>
	typeof expiry === 'string' ? expiry : null;

// The proposal's bytes, or null unless they decode to its digest, sent by its account.
const readTransaction = (
	proposal: Pick<
		Proposal,
		'digest' | 'multisigAddress' | 'transactionBytes'
	>,
) => {
	try {
		const bytes = fromBase64(proposal.transactionBytes);
		const digest =
			TransactionDataBuilder.getDigestFromBytes(bytes);
		const { sender } =
			TransactionDataBuilder.fromBytes(bytes);
		return digest === proposal.digest &&
			sameAddress(sender, proposal.multisigAddress)
			? { bytes, digest }
			: null;
	} catch {
		return null;
	}
};

// Null for a scheme that can't be checked offline.
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

// An invited key is in no set yet, so only the signer and the account are checked.
async function checkAccountAnswer(
	event: AccountEvent & {
		action: keyof typeof ANSWER_MESSAGES;
	},
	accountAddress: string,
): Promise<ProofResult> {
	const spec = ANSWER_MESSAGES[event.action];
	const signature = v1Signature(event.proof, spec.kind);
	const expiry = expiryText(event.proof?.expiry);
	if (!signature || expiry === null)
		return result('unverified', event);

	const message = new TextEncoder().encode(
		spec.message(accountAddress, expiry),
	);
	const signer = await recoverSigner(signature, () =>
		verifyPersonalMessageSignature(message, signature),
	);
	if (signer === null) return result('unverified', event);
	if (signer === 'invalid') return result('invalid', event);

	const address = signer.toSuiAddress();
	if (!sameAddress(address, event.actor))
		return result('invalid', event);
	return result('verified', event, address);
}

async function checkAccountEvent(
	event: AccountEvent | null | undefined,
	{
		accountAddress,
		members,
	}: { accountAddress: string; members: TrustedMembers },
): Promise<ProofResult> {
	if (
		event?.action === 'account.accepted' ||
		event?.action === 'account.rejected'
	)
		return checkAccountAnswer(
			{ ...event, action: event.action },
			accountAddress,
		);
	if (
		event?.action !== 'proposer.added' &&
		event?.action !== 'proposer.removed'
	)
		return result('unverified', event);
	const spec = PROPOSER_MESSAGES[event.action];

	const signature = v1Signature(event.proof, spec.kind);
	const expiry = expiryText(event.proof?.expiry);
	if (
		!signature ||
		expiry === null ||
		typeof event.subject !== 'string' ||
		!event.subject
	)
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

/** Checks a proposer add or remove, or an account accept or reject event's signed proof; `invalid` if it can't be read. */
export function verifyAccountEvent(
	event: AccountEvent | null | undefined,
	options: {
		accountAddress: string;
		members: TrustedMembers;
	},
): Promise<ProofResult> {
	return failClosed(
		() => checkAccountEvent(event, options),
		invalid,
	);
}

async function checkProposer({
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

/** Vouches for a member by membership, anyone else by a verified add event. */
export function verifyProposer(options: {
	proposer: string;
	event: AccountEvent | null | undefined;
	accountAddress: string;
	members: TrustedMembers;
}): Promise<ProofResult> {
	return failClosed(() => checkProposer(options), invalid);
}

async function checkProposalCreated(
	event: AccountEvent | null | undefined,
	proposal: Pick<
		Proposal,
		| 'digest'
		| 'multisigAddress'
		| 'proposerAddress'
		| 'transactionBytes'
	>,
): Promise<ProofResult> {
	const signature =
		event?.action === 'proposal.created'
			? v1Signature(event.proof, 'proposal.create')
			: null;
	if (!event || !signature)
		return result('unverified', event);

	const transaction = readTransaction(proposal);
	if (
		!transaction ||
		transaction.digest !== event.subject ||
		!sameAddress(event.actor, proposal.proposerAddress)
	)
		return result('invalid', event);

	const signer = await recoverSigner(signature, () =>
		verifyTransactionSignature(
			transaction.bytes,
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

/** Checks a `proposal.created` proof against the proposal's bytes, account and proposer. */
export function verifyProposalCreated(
	event: AccountEvent | null | undefined,
	proposal: Pick<
		Proposal,
		| 'digest'
		| 'multisigAddress'
		| 'proposerAddress'
		| 'transactionBytes'
	>,
): Promise<ProofResult> {
	return failClosed(
		() => checkProposalCreated(event, proposal),
		invalid,
	);
}

// Verified by a signature from `address` in `proposal.signatures`, invalid if an entry under its key doesn't check out.
const proposerVoteStatus = async (
	proposal: PublicProposal,
	address: string,
): Promise<ProofStatus> => {
	const transaction = readTransaction(proposal);
	if (!transaction) return 'unverified';
	const entries = Array.isArray(proposal.signatures)
		? proposal.signatures
		: [];
	let status: ProofStatus = 'unverified';
	for (const entry of entries) {
		const claimed = sameAddress(
			keyAddress(entry?.publicKey),
			address,
		);
		const signature: unknown = entry?.signature;
		if (typeof signature !== 'string') {
			if (claimed) return 'invalid';
			continue;
		}
		const signer = await recoverSigner(signature, () =>
			verifyTransactionSignature(
				transaction.bytes,
				signature,
			),
		);
		if (signer === null) continue;
		const signed =
			signer !== 'invalid' &&
			sameAddress(signer.toSuiAddress(), address);
		if (signed) status = 'verified';
		else if (claimed) return 'invalid';
	}
	return status;
};

async function checkProposalProposer(
	proposal: PublicProposal,
	{ members }: { members: TrustedMembers },
): Promise<ProofStatus> {
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
	// A member's vote signs the same bytes as their created proof.
	const signatureStatus =
		created.status === 'unverified' &&
		isMember(proposal.proposerAddress, members)
			? await proposerVoteStatus(
					proposal,
					proposal.proposerAddress,
				)
			: created.status;
	return worst(signatureStatus, proposer.status);
}

/** Verifies a member by their signature on the bytes (through a vote, that they signed them, not that they submitted the proposal), anyone else by their created and add events. */
export function verifyProposalProposer(
	proposal: PublicProposal,
	options: { members: TrustedMembers },
): Promise<ProofStatus> {
	return failClosed(
		() => checkProposalProposer(proposal, options),
		() => 'invalid',
	);
}
