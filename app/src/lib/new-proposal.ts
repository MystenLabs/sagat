// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The rules of the new-proposal wizard, kept free of React so the copy
// and the limits are in one place: the proposal types, what blocks Review
// on a transfer, the generated title, and how pasted bytes are read.
import { Transaction } from '@mysten/sui/transactions';
import {
	formatAddress,
	isValidSuiAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';

import {
	formatCoinAmount,
	getMaxInputAmount,
	isSuiCoinType,
	parseAmount,
} from './coins';
import { VALIDATION } from './constants';
import { textLength } from './create-multisig';

export type ProposalType = 'transfer' | 'bytes';

/** The radio cards on the Type step, in order. */
export const PROPOSAL_TYPES: readonly {
	id: ProposalType;
	title: string;
	description: string;
}[] = [
	{
		id: 'transfer',
		title: 'Transfer',
		description:
			'Send tokens from the account to one address.',
	},
	{
		id: 'bytes',
		title: 'Transaction bytes',
		description:
			'Paste a transaction built somewhere else, such as the Sui CLI, and propose it as it is.',
	},
];

/** What Details hands to Review: the built transaction and its title. */
export interface ReadyProposal {
	bytes: string;
	title: string;
}

/** A transfer as typed on the Details step. */
export interface TransferDraft {
	coinType: string;
	/** As typed, in whole units ("1,234.5"). */
	amount: string;
	recipient: string;
}

export const TITLE_MAX =
	VALIDATION.MAX_PROPOSAL_DESCRIPTION_LENGTH;

/**
 * The wizard's route. `type` lands on Details for that type, `coinType`
 * preselects the asset to send.
 */
export function newProposalPath(
	address: string,
	params: { type?: ProposalType; coinType?: string } = {},
): string {
	const query = new URLSearchParams();
	if (params.type) query.set('type', params.type);
	if (params.coinType) query.set('asset', params.coinType);
	const search = query.toString();
	return `/multisig/${address}/proposals/new${search ? `?${search}` : ''}`;
}

/** The `type` query parameter, or null when absent or unknown. */
export function proposalTypeFromQuery(
	value: string | null,
): ProposalType | null {
	return (
		PROPOSAL_TYPES.find((type) => type.id === value)?.id ??
		null
	);
}

/**
 * The default title of a transfer, "Send 3,850,000 USDC to 0x8d4a…3f10",
 * or null until the amount, the symbol and a valid recipient are there.
 */
export function transferTitle({
	rawAmount,
	decimals,
	symbol,
	recipient,
}: {
	rawAmount: bigint | null;
	decimals: number | null;
	symbol: string | null;
	recipient: string;
}): string | null {
	const to = recipient.trim();
	if (
		rawAmount === null ||
		rawAmount <= 0n ||
		decimals === null ||
		!symbol ||
		!isValidSuiAddress(to)
	)
		return null;
	return `Send ${formatCoinAmount(rawAmount.toString(), decimals)} ${symbol} to ${formatAddress(normalizeSuiAddress(to))}`;
}

/**
 * What Max puts in the field, as an input string (no grouping): the
 * whole balance, SUI included, since a SUI transfer of the whole balance
 * sends the gas coin itself (see `TransferCheck.transferAllSui`). Null
 * when nothing can be sent.
 */
export function maxAmount({
	balance,
	decimals,
}: {
	balance: string;
	decimals: number;
}): string | null {
	return getMaxInputAmount(balance, decimals);
}

export interface TransferCheck {
	assetError: string | null;
	/** Null while the field is empty, which still blocks Review. */
	amountError: string | null;
	/** Null while the field is empty, which still blocks Review. */
	recipientError: string | null;
	recipientValid: boolean;
	/** The amount in on-chain units once it parses. */
	rawAmount: bigint | null;
	/**
	 * True when the amount is the whole SUI balance. The transfer then
	 * sends the gas coin itself, so the recipient gets the balance minus
	 * the gas fee and the account ends at zero.
	 */
	transferAllSui: boolean;
	canReview: boolean;
}

/**
 * The Details checks for a transfer. `balance` (raw units) and
 * `decimals` are the chosen asset's, null while unknown; amounts are
 * only checked once both are known.
 */
export function checkTransfer({
	draft,
	balance,
	decimals,
	symbol,
}: {
	draft: TransferDraft;
	balance: string | null;
	decimals: number | null;
	symbol: string | null;
}): TransferCheck {
	const assetError = draft.coinType
		? null
		: COPY.chooseAsset;

	let amountError: string | null = null;
	let rawAmount: bigint | null = null;
	const held = toBigInt(balance);
	if (draft.amount.trim() && decimals !== null) {
		rawAmount = parseAmount(draft.amount, decimals);
		if (rawAmount === null)
			amountError = COPY.invalidAmount(decimals);
		else if (rawAmount === 0n)
			amountError = COPY.zeroAmount;
		else if (held !== null) {
			const shown = formatCoinAmount(
				held.toString(),
				decimals,
			);
			if (rawAmount > held)
				amountError = COPY.overBalance(
					symbol ?? 'asset',
					shown,
				);
		}
	}
	const transferAllSui =
		isSuiCoinType(draft.coinType) &&
		held !== null &&
		rawAmount !== null &&
		rawAmount === held;

	const recipient = draft.recipient.trim();
	const recipientValid =
		!!recipient && isValidSuiAddress(recipient);
	const recipientError =
		recipient && !recipientValid
			? COPY.invalidAddress
			: null;

	return {
		assetError,
		amountError,
		recipientError,
		recipientValid,
		rawAmount,
		transferAllSui,
		canReview:
			!assetError &&
			!amountError &&
			!recipientError &&
			recipientValid &&
			decimals !== null &&
			held !== null &&
			rawAmount !== null &&
			rawAmount > 0n,
	};
}

function toBigInt(value: string | null): bigint | null {
	if (value === null) return null;
	try {
		return BigInt(value);
	} catch {
		return null;
	}
}

/**
 * The error for a proposal title, or null when it is fine. Counts code
 * points after trimming, as the API does.
 */
export function titleError(title: string): string | null {
	const length = textLength(title);
	if (length === 0) return COPY.titleMissing;
	if (length > TITLE_MAX) return COPY.titleTooLong(length);
	return null;
}

export type BytesCheck =
	| { kind: 'empty' }
	| { kind: 'unreadable' }
	| { kind: 'wrong-sender'; sender: string }
	/** `bytes` is the trimmed input, proposed as it is. */
	| { kind: 'ok'; bytes: string; commands: number };

/**
 * Reads pasted transaction bytes: trims them, parses them as base64 BCS
 * with Transaction.from, and compares the normalized sender with
 * `account`. A serialized JSON transaction isn't bytes, so it counts as
 * unreadable.
 */
export function checkBytes(
	input: string,
	account: string,
): BytesCheck {
	const trimmed = input.trim();
	if (!trimmed) return { kind: 'empty' };
	if (trimmed.startsWith('{'))
		return { kind: 'unreadable' };

	let sender: string | null | undefined;
	let commands: number;
	try {
		const data = Transaction.from(trimmed).getData();
		sender = data.sender;
		commands = data.commands.length;
	} catch {
		return { kind: 'unreadable' };
	}
	if (!sender || !isValidSuiAddress(sender))
		return { kind: 'unreadable' };

	const normalized = normalizeSuiAddress(sender);
	if (normalized !== normalizeSuiAddress(account))
		return { kind: 'wrong-sender', sender: normalized };
	return {
		kind: 'ok',
		bytes: trimmed,
		commands,
	};
}

/** The status line under the bytes field; null while it is empty. */
export function bytesStatusText(
	check: BytesCheck,
	accountName: string,
): string | null {
	switch (check.kind) {
		case 'empty':
			return null;
		case 'unreadable':
			return COPY.unreadableBytes;
		case 'wrong-sender':
			return `These bytes are sent from ${formatAddress(check.sender)}, not ${accountName}. Build the transaction with this account as the sender.`;
		case 'ok':
			return `Read as a transaction with ${check.commands} ${check.commands === 1 ? 'command' : 'commands'}, sent from this account.`;
	}
}

export const COPY = {
	chooseAsset: 'Choose an asset to send.',
	invalidAmount: (decimals: number) =>
		`Enter a valid amount (up to ${decimals} decimals).`,
	zeroAmount: 'Enter an amount above 0.',
	overBalance: (symbol: string, balance: string) =>
		`More than the account holds. The ${symbol} balance is ${balance}.`,
	invalidAddress:
		'This isn’t a valid Sui address. Check you pasted all of it: 0x and 64 characters.',
	validAddress: 'Valid Sui address',
	addressPlaceholder:
		'Paste the full Sui address, starting with 0x',
	titlePlaceholderTransfer: 'Filled in from the transfer',
	titlePlaceholder: 'Add a title',
	titleHintTransfer:
		'Signers see this title in the proposal list. You can change it.',
	titleHintBytes:
		'Bytes don’t include a title. Name it so signers know what it does.',
	titleMissing:
		'Add a title so signers know what this proposal is for.',
	titleTooLong: (length: number) =>
		`${length} of ${TITLE_MAX} characters. Use ${TITLE_MAX} or fewer.`,
	unreadableBytes:
		'Couldn’t read this as a transaction. Paste the full bytes in base64, the way your tool exported them.',
	typeNote:
		'You can review everything before anyone signs.',
	transferNote:
		'The transfer is simulated before anyone signs. You’ll see the result on the next step.',
	bytesNote:
		'The transaction is simulated before anyone signs. You’ll see the result on the next step.',
	buildFailed:
		'Couldn’t build the transfer. Check your connection and try again.',
	simulationFailed: (reason: string) =>
		`Simulation failed: ${reason}. If executed, it would fail and the account would still pay gas.`,
	createFailed:
		'Couldn’t create the proposal. Nothing was sent to the other signers. Check your connection and try again.',
	signatureDeclined:
		'The wallet didn’t sign the proposal. Nothing was created.',
};
