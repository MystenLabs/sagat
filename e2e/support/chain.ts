// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { expect } from '@playwright/test';

import { E2E } from './env';

export const SUI_TYPE = '0x2::sui::SUI';

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

	async balance(address: string, coinType = SUI_TYPE) {
		const { balance } = await this.client.getBalance({
			owner: address,
			coinType,
		});
		return BigInt(balance.balance);
	}

	// Returns base64 bytes of a fully built SUI transfer, as the API expects.
	async buildSuiTransfer({
		sender,
		recipient,
		amount,
	}: {
		sender: string;
		recipient: string;
		amount: bigint;
	}) {
		const tx = new Transaction();
		tx.setSender(sender);
		const [coin] = tx.splitCoins(tx.gas, [amount]);
		tx.transferObjects([coin], recipient);
		return toBase64(
			await tx.build({ client: this.client }),
		);
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
