// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { expect } from '@playwright/test';

import { E2E } from './env';

export const SUI_TYPE = '0x2::sui::SUI';

const Clock = bcs.struct('Clock', {
	id: bcs.Address,
	timestamp_ms: bcs.u64(),
});

export type GasCoin = {
	objectId: string;
	version: string;
	digest: string;
};

export type Expiration = Parameters<
	Transaction['setExpiration']
>[0];

// Reads and funds accounts on the local network, independently of the app.
export class Chain {
	readonly client = new SuiGrpcClient({
		network: 'localnet',
		baseUrl: E2E.rpcUrl,
	});

	// The local faucet sends 1,000 SUI per request.
	async fund(address: string) {
		const before = await this.balance(address);
		await retry(() =>
			requestSuiFromFaucetV2({
				host: E2E.faucetUrl,
				recipient: address,
			}),
		);
		await expect
			.poll(() => this.balance(address), {
				message: `faucet funds reach ${address}`,
			})
			.toBeGreaterThan(before);
	}

	// Sends `address` exactly `count` SUI coins of `amount` each, e.g. so that
	// several proposals can each pay gas with their own coin.
	async fundWithCoins(
		address: string,
		{ count, amount }: { count: number; amount: bigint },
	) {
		const tx = new Transaction();
		const coins = tx.splitCoins(
			tx.gas,
			Array.from({ length: count }, () => amount),
		);
		tx.transferObjects(
			Array.from({ length: count }, (_, i) => coins[i]),
			address,
		);
		await this.executeAsFunder(tx);
		return this.coins(address);
	}

	// Executes `tx` from a fresh account the faucet funds, and returns the
	// objects it created, with their types.
	async executeAsFunder(tx: Transaction) {
		const funder = new Ed25519Keypair();
		await this.fund(funder.toSuiAddress());
		const result =
			await this.client.signAndExecuteTransaction({
				transaction: tx,
				signer: funder,
				include: { effects: true, objectTypes: true },
			});
		if (result.$kind !== 'Transaction')
			throw new Error(
				`Transaction failed: ${JSON.stringify(result.FailedTransaction.status)}`,
			);
		await this.client.waitForTransaction({
			digest: result.Transaction.digest,
		});
		const { effects, objectTypes } = result.Transaction;
		return effects.changedObjects
			.filter((o) => o.idOperation === 'Created')
			.map((o) => ({
				objectId: o.objectId,
				type: objectTypes[o.objectId],
			}));
	}

	async epoch() {
		const { systemState } =
			await this.client.getCurrentSystemState();
		return Number(systemState.epoch);
	}

	// The SUI coins `owner` holds, as gas payment references.
	async coins(owner: string) {
		const { objects } = await this.client.listCoins({
			owner,
		});
		return objects.map(({ objectId, version, digest }) => ({
			objectId,
			version,
			digest,
		}));
	}

	async balance(address: string, coinType = SUI_TYPE) {
		const { balance } = await this.client.getBalance({
			owner: address,
			coinType,
		});
		return BigInt(balance.balance);
	}

	// Returns base64 bytes of a fully built SUI transfer, as the API expects.
	// Pass `gasCoin` to pay gas with that coin only.
	async buildSuiTransfer({
		sender,
		recipient,
		amount,
		gasCoin,
		expiration,
	}: {
		sender: string;
		recipient: string;
		amount: bigint;
		gasCoin?: GasCoin;
		expiration?: Expiration;
	}) {
		const tx = new Transaction();
		tx.setSender(sender);
		if (gasCoin) tx.setGasPayment([gasCoin]);
		if (expiration) tx.setExpiration(expiration);
		const [coin] = tx.splitCoins(tx.gas, [amount]);
		tx.transferObjects([coin], recipient);
		return toBase64(
			await tx.build({ client: this.client }),
		);
	}

	// Returns base64 bytes of a SUI transfer of more than `sender` holds, so
	// executing (or simulating) it fails. Building with a client would
	// simulate the transaction and reject it, so pin the gas coins, price and
	// budget and build it offline instead.
	async buildOverdrawnSuiTransfer({
		sender,
		recipient,
	}: {
		sender: string;
		recipient: string;
	}) {
		const [coins, { referenceGasPrice }] =
			await Promise.all([
				this.coins(sender),
				this.client.getReferenceGasPrice(),
			]);
		const tx = new Transaction();
		tx.setSender(sender);
		tx.setGasPayment(coins);
		tx.setGasPrice(BigInt(referenceGasPrice));
		tx.setGasBudget(10_000_000n);
		const [coin] = tx.splitCoins(tx.gas, [
			(await this.balance(sender)) + 1n,
		]);
		tx.transferObjects([coin], recipient);
		return toBase64(await tx.build());
	}

	// Returns base64 bytes of a SUI transfer that passes a dry run now but
	// fails on chain once `seconds` more have passed. Out of a funded coin it
	// sets aside all but the deadline (the clock's time in seconds, read once
	// funding is done, plus `seconds`) as MIST, then sends the clock's time
	// in seconds, as MIST. (Spending an input first doesn't do: the network
	// then refuses the transaction before executing it.) `sender` pays gas
	// with the coins it already holds.
	async buildSuiTransferFailingAfter({
		sender,
		recipient,
		seconds,
	}: {
		sender: string;
		recipient: string;
		seconds: number;
	}) {
		// Enough until the clock passes 10^10 seconds, centuries away.
		const funded = 10n ** 10n;
		const funding = new Transaction();
		const [funds] = funding.splitCoins(funding.gas, [
			funded,
		]);
		funding.transferObjects([funds], sender);
		const [coin] = await this.executeAsFunder(funding);
		const deadline =
			(await this.clockMs()) / 1000n + BigInt(seconds);

		const tx = new Transaction();
		tx.setSender(sender);
		tx.setGasPayment(
			(await this.coins(sender)).filter(
				({ objectId }) => objectId !== coin.objectId,
			),
		);
		const nowSeconds = tx.moveCall({
			target: '0x1::u64::divide_and_round_up',
			arguments: [
				tx.moveCall({
					target: '0x2::clock::timestamp_ms',
					arguments: [tx.object.clock()],
				}),
				tx.pure.u64(1000),
			],
		});
		const [setAside, payment] = tx.splitCoins(
			tx.object(coin.objectId),
			[funded - deadline, nowSeconds],
		);
		tx.transferObjects([setAside], sender);
		tx.transferObjects([payment], recipient);
		return toBase64(
			await tx.build({ client: this.client }),
		);
	}

	// Whether a dry run of base64 transaction bytes succeeds right now.
	async dryRunSucceeds(transactionBytes: string) {
		const result = await this.client.simulateTransaction({
			transaction: fromBase64(transactionBytes),
			include: { effects: true },
		});
		return (
			result.$kind === 'Transaction' &&
			result.Transaction.effects.status.success
		);
	}

	// The on-chain clock (0x6), in milliseconds.
	async clockMs() {
		const { object } = await this.client.getObject({
			objectId: '0x6',
			include: { content: true },
		});
		return BigInt(Clock.parse(object.content).timestamp_ms);
	}

	// Net SUI a transaction's gas cost its payer. Negative when storage
	// rebates (e.g. from coins merged into the gas coin) exceed the costs.
	async gasCost(digest: string) {
		const result = await this.client.getTransaction({
			digest,
			include: { effects: true },
		});
		const { gasUsed } = (
			result.Transaction ?? result.FailedTransaction
		).effects;
		return (
			BigInt(gasUsed.computationCost) +
			BigInt(gasUsed.storageCost) -
			BigInt(gasUsed.storageRebate)
		);
	}

	// Executes signed base64 transaction bytes and waits for the result.
	async execute(
		transactionBytes: string,
		signature: string,
	) {
		const result = await this.client.executeTransaction({
			transaction: fromBase64(transactionBytes),
			signatures: [signature],
			include: { effects: true },
		});
		if (result.$kind !== 'Transaction')
			throw new Error(
				`Transaction failed: ${JSON.stringify(result.FailedTransaction.status)}`,
			);
		await this.client.waitForTransaction({
			digest: result.Transaction.digest,
		});
	}
}

export function randomAddress() {
	return new Ed25519Keypair().toSuiAddress();
}

async function retry<T>(
	fn: () => Promise<T>,
	attempts = 3,
): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await fn();
		} catch (error) {
			if (attempt >= attempts) throw error;
			await new Promise((r) =>
				setTimeout(r, 500 * attempt),
			);
		}
	}
}
