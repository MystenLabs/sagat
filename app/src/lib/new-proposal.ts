// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The rules of the new-proposal wizard, kept free of React so the copy
// and the limits are in one place: the proposal types, what blocks Review
// on a transfer, the generated title, and how pasted bytes are read.
import {
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import {
	formatAddress,
	isValidSuiAddress,
	normalizeSuiAddress,
	toBase64,
} from '@mysten/sui/utils';

import { content } from '../content';
import { addressStatus } from './address-field';
import {
	formatCoinAmount,
	formatInputAmount,
	isSuiCoinType,
	parseAmount,
	type SuiGasCoins,
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
	{ id: 'transfer', ...content.newProposal.types.transfer },
	{ id: 'bytes', ...content.newProposal.types.bytes },
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
	return COPY.transferTitle(
		formatCoinAmount(rawAmount.toString(), decimals),
		symbol,
		formatAddress(normalizeSuiAddress(to)),
	);
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
	 * True when the amount is what Max fills on SUI, usually the whole
	 * balance (see `maxTransfer`). The transfer then sends the gas coin
	 * itself, so the recipient gets that amount minus the gas fee.
	 */
	transferAllSui: boolean;
	canReview: boolean;
}

/**
 * The Details checks for a transfer. `balance` (raw units) and
 * `decimals` are the chosen asset's, null while unknown; amounts are
 * only checked once both are known. `maxAmount` is the raw amount Max
 * fills (`maxTransfer`), the balance when left out. Below the balance,
 * it is also the most the transfer can send. Null means Max is not
 * known yet (SUI before its coins are listed): Review waits for it.
 */
export function checkTransfer({
	draft,
	balance,
	decimals,
	symbol,
	maxAmount,
}: {
	draft: TransferDraft;
	balance: string | null;
	decimals: number | null;
	symbol: string | null;
	maxAmount?: bigint | null;
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
					symbol ?? COPY.unknownSymbol,
					shown,
				);
			else if (
				maxAmount != null &&
				maxAmount < held &&
				rawAmount > maxAmount
			)
				amountError = COPY.overMax(
					formatCoinAmount(maxAmount.toString(), decimals),
					symbol ?? COPY.unknownSymbol,
				);
		}
	}
	const sendsGasCoinAt =
		maxAmount === undefined ? held : maxAmount;
	const transferAllSui =
		isSuiCoinType(draft.coinType) &&
		sendsGasCoinAt !== null &&
		rawAmount !== null &&
		rawAmount === sendsGasCoinAt;

	const { valid: recipientValid, error: recipientError } =
		addressStatus(draft.recipient);

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
			maxAmount !== null &&
			rawAmount !== null &&
			rawAmount > 0n,
	};
}

/**
 * Whether the account holds no SUI to pay gas with: no SUI balance, or
 * one of 0. `balances` must be complete.
 */
export function lacksGas(
	balances: readonly {
		coinType: string;
		balance: string;
	}[],
): boolean {
	return !balances.some(
		(b) =>
			isSuiCoinType(b.coinType) &&
			(toBigInt(b.balance) ?? 0n) > 0n,
	);
}

export interface MaxTransfer {
	/** What Max fills in, as the amount field reads it. */
	amount: string;
	rawAmount: bigint;
	/** Max is less than the balance: the rest needs another transfer. */
	partial: boolean;
}

/**
 * What Max fills in for the chosen coin, or null when there is nothing
 * to send. Max on SUI sends the gas coin, and one transfer pays gas with
 * at most MAX_GAS_PAYMENT_OBJECTS coins: the node takes the first of
 * them and the whole address balance. So when the account holds more
 * SUI coins than that, Max is the address balance plus those coins'
 * value, and the rest goes with the next transfer. `balance` is the
 * coin's total (coins and address balance); `gasCoins` the SUI coins a
 * transfer can spend (`useSuiGasCoins`), null for another coin or while
 * unknown.
 */
export function maxTransfer({
	balance,
	addressBalance,
	gasCoins,
	decimals,
}: {
	balance: string;
	addressBalance: string;
	gasCoins: SuiGasCoins | null;
	decimals: number;
}): MaxTransfer | null {
	const total = toBigInt(balance);
	if (total === null) return null;
	const spendable = gasCoins?.hasMore
		? (toBigInt(addressBalance) ?? 0n) + gasCoins.value
		: null;
	const partial = spendable !== null && spendable < total;
	const rawAmount = partial ? spendable : total;
	if (rawAmount <= 0n) return null;
	return {
		amount: formatInputAmount(
			rawAmount.toString(),
			decimals,
		),
		rawAmount,
		partial,
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
 * The error for a proposal title, or null when it is fine. The title is
 * optional, so only a long one is refused. Counts code points after
 * trimming. The limit is the app's own: the API stores the title as
 * sent, and only the database column's 1,000 characters bind there.
 */
export function titleError(title: string): string | null {
	const length = textLength(title);
	if (length > TITLE_MAX) return COPY.titleTooLong(length);
	return null;
}

export type BytesCheck =
	| { kind: 'empty' }
	| { kind: 'unreadable' }
	/** JSON that still needs a client to build. */
	| { kind: 'unresolved' }
	| { kind: 'wrong-sender'; sender: string }
	/**
	 * `bytes` is the base64 to propose: the input without its whitespace,
	 * or the BCS a JSON transaction builds to.
	 */
	| { kind: 'ok'; bytes: string; commands: number };

/**
 * Reads a pasted transaction and compares its normalized sender with
 * `account`. Base64 BCS is read with all whitespace dropped (a paste
 * wrapped across lines is one transaction). JSON, as
 * Transaction#toJSON writes it, is read only when it is fully resolved
 * (the SDK's isFullyResolved: sender, gas and concrete inputs), so it
 * builds to bytes offline.
 */
export function checkBytes(
	input: string,
	account: string,
): BytesCheck {
	const trimmed = input.trim();
	if (!trimmed) return { kind: 'empty' };
	const read = trimmed.startsWith('{')
		? readJson(trimmed)
		: readBase64(trimmed.replace(/\s/g, ''));
	if (read.kind !== 'read') return read;
	const { bytes, sender, commands } = read;
	if (!sender || !isValidSuiAddress(sender))
		return { kind: 'unreadable' };

	const normalized = normalizeSuiAddress(sender);
	if (normalized !== normalizeSuiAddress(account))
		return { kind: 'wrong-sender', sender: normalized };
	return {
		kind: 'ok',
		bytes,
		commands,
	};
}

type ReadTransaction =
	| { kind: 'unreadable' | 'unresolved' }
	| {
			kind: 'read';
			bytes: string;
			sender: string | null | undefined;
			commands: number;
	  };

function readBase64(bytes: string): ReadTransaction {
	try {
		const data = Transaction.from(bytes).getData();
		return {
			kind: 'read',
			bytes,
			sender: data.sender,
			commands: data.commands.length,
		};
	} catch {
		return { kind: 'unreadable' };
	}
}

function readJson(json: string): ReadTransaction {
	let tx: Transaction;
	try {
		tx = Transaction.from(json);
	} catch {
		return { kind: 'unreadable' };
	}
	if (!tx.isFullyResolved()) return { kind: 'unresolved' };
	const data = tx.getData();
	try {
		// Once fully resolved, Transaction#build skips the resolver and
		// serializes these data, so this is its result without the await.
		const bytes =
			TransactionDataBuilder.restore(data).build();
		return {
			kind: 'read',
			bytes: toBase64(bytes),
			sender: data.sender,
			commands: data.commands.length,
		};
	} catch {
		return { kind: 'unreadable' };
	}
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
		case 'unresolved':
			return COPY.bytesUnresolved;
		case 'wrong-sender':
			return COPY.bytesWrongSender(
				formatAddress(check.sender),
				accountName,
			);
		case 'ok':
			return COPY.bytesRead(check.commands);
	}
}

export const COPY = content.newProposal;
