// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import {
	cpSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transaction } from '@mysten/sui/transactions';

import { type Chain } from './chain';
import { PATHS } from './paths';

// A coin other than SUI that anyone can mint (`move/test_coin`).
export type TestCoin = { type: string; faucetId: string };

export type CoinMetadata = {
	decimals: number;
	symbol: string;
	name: string;
};

// The package as checked in: TEST, 6 decimals.
const TEST: CoinMetadata = {
	decimals: 6,
	symbol: 'TEST',
	name: 'Test Coin',
};

/**
 * Builds and publishes `move/test_coin` with `metadata` in place of its
 * constants, so each call is a new coin type with its own faucet. Global
 * setup publishes TEST this way; a test can publish its own in a few
 * seconds.
 */
export async function publishTestCoin(
	chain: Chain,
	metadata: CoinMetadata = TEST,
): Promise<TestCoin> {
	const { modules, dependencies } = build(metadata);

	const tx = new Transaction();
	tx.moveCall({
		target: '0x2::package::make_immutable',
		arguments: [tx.publish({ modules, dependencies })],
	});
	const created = await chain.executeAsFunder(tx);
	const faucet = created.find((o) =>
		o.type?.endsWith('::test_coin::Faucet'),
	);
	if (!faucet)
		throw new Error('Publishing the test coin failed');
	const [packageId] = faucet.type.split('::');
	return {
		type: `${packageId}::test_coin::TEST_COIN`,
		faucetId: faucet.objectId,
	};
}

// Builds a copy of the package, so builds can run side by side.
function build({ decimals, symbol, name }: CoinMetadata) {
	if (
		!Number.isInteger(decimals) ||
		decimals < 0 ||
		decimals > 255
	)
		throw new Error(`Decimals must be a u8: ${decimals}`);
	const dir = mkdtempSync(join(tmpdir(), 'test-coin-'));
	try {
		cpSync(PATHS.testCoinPackage, dir, {
			recursive: true,
			filter: (path) => !/\/(build|Move\.lock)$/.test(path),
		});
		const source = `${dir}/sources/test_coin.move`;
		let text = readFileSync(source, 'utf8');
		for (const [constant, value] of [
			['DECIMALS: u8', String(decimals)],
			['SYMBOL: vector<u8>', moveBytes(symbol)],
			['NAME: vector<u8>', moveBytes(name)],
		]) {
			const line = new RegExp(
				`^const ${constant} = .*;$`,
				'm',
			);
			if (!line.test(text))
				throw new Error(
					`test_coin.move has no ${constant}`,
				);
			text = text.replace(
				line,
				`const ${constant} = ${value};`,
			);
		}
		writeFileSync(source, text);
		return JSON.parse(
			execFileSync(
				'sui',
				[
					'move',
					'build',
					'--dump-bytecode-as-base64',
					'--path',
					dir,
				],
				// Piped so a failed build's output ends up in the error.
				{ encoding: 'utf8', stdio: 'pipe' },
			),
		) as { modules: string[]; dependencies: string[] };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// A Move hex byte string, so any UTF-8 text fits.
function moveBytes(text: string) {
	return `x"${Buffer.from(text, 'utf8').toString('hex')}"`;
}

/** Mints one coin of `coin` per amount (in base units) to `address`. */
export async function mintCoin(
	chain: Chain,
	{ type, faucetId }: TestCoin,
	address: string,
	amounts: bigint[],
) {
	const [packageId] = type.split('::');
	const tx = new Transaction();
	tx.transferObjects(
		amounts.map((amount) =>
			tx.moveCall({
				target: `${packageId}::test_coin::mint`,
				arguments: [
					tx.object(faucetId),
					tx.pure.u64(amount),
				],
			}),
		),
		address,
	);
	await chain.executeAsFunder(tx);
	return type;
}

/** Mints one TEST coin per amount (in base units) to `address`. */
export async function mintTestCoin(
	chain: Chain,
	address: string,
	amounts: bigint[],
) {
	return mintCoin(chain, testCoin(), address, amounts);
}

/** The type of the TEST coin global setup published. */
export function testCoinType() {
	return testCoin().type;
}

function testCoin(): TestCoin {
	const type = process.env.E2E_TEST_COIN_TYPE;
	const faucetId = process.env.E2E_TEST_COIN_FAUCET;
	if (!type || !faucetId)
		throw new Error(
			'The test coin is published in global setup',
		);
	return { type, faucetId };
}
