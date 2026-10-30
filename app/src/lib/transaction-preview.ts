// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// What the Transaction preview block shows, kept free of React: the
// digest, Ledger hash and sender read from the bytes, and the gas, epoch
// and changes read from the dry run, with the gas payer's net gas (a cost
// or a rebate) split out of its SUI balance change.
import type { SuiClientTypes } from '@mysten/sui/client';
import { messageWithIntent } from '@mysten/sui/cryptography';
import {
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import {
	fromBase64,
	normalizeSuiAddress,
	toHex,
} from '@mysten/sui/utils';
import { blake2b } from '@noble/hashes/blake2.js';

import { formatCoinAmount, isSuiCoinType } from './coins';
import { formatDateTime } from './dates';
import { networkLabel, type SuiNetwork } from './network';

/** The dry run's transaction payload, with everything the preview shows included. */
export type SimulatedTransaction =
	SuiClientTypes.Transaction<{
		effects: true;
		balanceChanges: true;
		events: true;
		transaction: true;
		objectTypes: true;
	}>;

export type SimulationStatus =
	'pending' | 'passed' | 'failed';

export interface NamedAccount {
	address: string;
	name: string | null;
}

export interface TransactionPreviewInput {
	/** The transaction, base64. */
	bytes: string;
	status: SimulationStatus;
	/** The dry run's payload: the `Transaction` on success, the `FailedTransaction` when it ran and failed; absent while pending or when the node refused the transaction. */
	result?: SimulatedTransaction | null;
	/** Why the simulation failed, when known; the payload's status error is the fallback. */
	error?: string | null;
	network: SuiNetwork;
	/** When the simulation ran; null while pending. */
	simulatedAt?: Date | null;
	/** Accounts to show by name, such as the multisig the proposal is for. */
	accounts?: NamedAccount[];
}

export interface BalanceChangeRow {
	address: string;
	/** The account's name, "Recipient" for an address that only gains, or null for a bare address. */
	label: string | null;
	/** True on the gas payer's net gas (the sponsor's, else the sender's), split out of its SUI change: negative for a cost, positive for a rebate. */
	gas: boolean;
	coinType: string;
	/** Raw units, signed. */
	amount: string;
}

export interface TransactionPreviewModel {
	status: SimulationStatus;
	/** From the bytes, so it is known before the dry run returns. */
	digest: string;
	/** `0x`-hex blake2b of the intent message, what a Ledger shows; from the bytes. */
	ledgerHash: string;
	/** From the bytes; null when the bytes set no sender. */
	sender: NamedAccount | null;
	/** "Mainnet · Oct 13, 2026, 8:54 AM" once simulated, "Mainnet" while pending. */
	statusMeta: string;
	/** The failure, when `status` is 'failed'. */
	error: string | null;
	epoch: string | null;
	/** "0.0041 SUI" for a cost, "0.0019 SUI rebate" when the storage rebate exceeds it, "0 SUI" for none; null until the dry run ran. */
	gas: string | null;
	balanceChanges: BalanceChangeRow[];
	objectChanges: SuiClientTypes.ChangedObject[];
	objectTypes: Record<string, string>;
	events: SuiClientTypes.Event[];
	/** The parsed transaction (inputs, commands), from the bytes. */
	transaction: SuiClientTypes.TransactionData;
	/** The dry run's payload for the Raw JSON tab, or null. */
	raw: SimulatedTransaction | null;
}

/** The `0x`-hex blake2b-256 of the intent message, what a Ledger shows. */
function ledgerHashOf(bytes: Uint8Array): string {
	const intentMessage = messageWithIntent(
		'TransactionData',
		bytes,
	);
	return `0x${toHex(blake2b(intentMessage, { dkLen: 32 }))}`;
}

/** Net gas: computation plus storage, less the storage rebate; negative when the rebate exceeds the rest. */
export function gasCost(
	gas: SuiClientTypes.GasCostSummary,
): bigint {
	return (
		BigInt(gas.computationCost) +
		BigInt(gas.storageCost) -
		BigInt(gas.storageRebate)
	);
}

/**
 * The balance changes as rows, with the gas payer's net gas split out of
 * its SUI change into a row of its own at the end, so the payer's SUI row
 * shows the transfer alone (dropped when that is 0). The payer is the
 * sponsor on a sponsored transaction, else the sender; every other row is
 * left as it is. The gas row is `-cost`: negative for a cost, positive for
 * a rebate. Without a SUI change at the payer (gas mocked) or with a zero
 * cost there is no gas row.
 */
function balanceChangeRows(
	changes: SuiClientTypes.BalanceChange[],
	cost: bigint,
	sender: NamedAccount | null,
	payer: NamedAccount | null,
	nameOf: (address: string) => string | null,
): BalanceChangeRow[] {
	const isAt =
		(account: NamedAccount | null) => (address: string) =>
			account !== null &&
			normalizeSuiAddress(address) ===
				normalizeSuiAddress(account.address);
	const isSender = isAt(sender);
	const isPayer = isAt(payer);

	const rows: BalanceChangeRow[] = [];
	let gasRow: BalanceChangeRow | null = null;
	for (const change of changes) {
		let amount = BigInt(change.amount);
		if (
			!gasRow &&
			cost !== 0n &&
			payer &&
			isPayer(change.address) &&
			isSuiCoinType(change.coinType)
		) {
			gasRow = {
				address: payer.address,
				label: payer.name,
				gas: true,
				coinType: change.coinType,
				amount: (-cost).toString(),
			};
			amount += cost;
			if (amount === 0n) continue;
		}
		rows.push({
			address: change.address,
			label:
				nameOf(change.address) ??
				(amount > 0n && !isSender(change.address)
					? 'Recipient'
					: null),
			gas: false,
			coinType: change.coinType,
			amount: amount.toString(),
		});
	}
	if (gasRow) rows.push(gasRow);
	return rows;
}

/** "0.0041 SUI" for a cost, "0.0019 SUI rebate" for a rebate. */
export function gasLabel(cost: bigint): string {
	const amount = `${formatCoinAmount((cost < 0n ? -cost : cost).toString(), 9)} SUI`;
	return cost < 0n ? `${amount} rebate` : amount;
}

/** Everything the Transaction preview block shows, from the bytes and the dry run. */
export function buildTransactionPreview(
	input: TransactionPreviewInput,
): TransactionPreviewModel {
	const {
		bytes,
		status,
		result = null,
		network,
		simulatedAt = null,
		accounts = [],
	} = input;

	const decoded = fromBase64(bytes);
	const transaction = Transaction.from(
		bytes,
	).getData() as SuiClientTypes.TransactionData;

	const names = new Map(
		accounts.map((account) => [
			normalizeSuiAddress(account.address),
			account.name,
		]),
	);
	const nameOf = (address: string) =>
		names.get(normalizeSuiAddress(address)) ?? null;

	const sender = transaction.sender
		? {
				address: transaction.sender,
				name: nameOf(transaction.sender),
			}
		: null;

	// The sponsor pays the gas on a sponsored transaction, else the sender.
	const payerAddress =
		transaction.gasData.owner ?? transaction.sender;
	const payer = payerAddress
		? {
				address: normalizeSuiAddress(payerAddress),
				name: nameOf(payerAddress),
			}
		: null;

	const cost = result
		? gasCost(result.effects.gasUsed)
		: null;

	return {
		status,
		digest:
			TransactionDataBuilder.getDigestFromBytes(decoded),
		ledgerHash: ledgerHashOf(decoded),
		sender,
		statusMeta: simulatedAt
			? `${networkLabel(network)} · ${formatDateTime(simulatedAt)}`
			: networkLabel(network),
		error:
			status === 'failed'
				? input.error ||
					result?.status.error?.message ||
					null
				: null,
		epoch: result?.epoch ?? null,
		gas: cost === null ? null : gasLabel(cost),
		balanceChanges: result
			? balanceChangeRows(
					result.balanceChanges,
					cost ?? 0n,
					sender,
					payer,
					nameOf,
				)
			: [],
		objectChanges: result?.effects.changedObjects ?? [],
		objectTypes: result?.objectTypes ?? {},
		events: result?.events ?? [],
		transaction,
		raw: result,
	};
}
