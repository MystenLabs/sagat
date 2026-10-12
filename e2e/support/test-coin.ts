// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import { Transaction } from '@mysten/sui/transactions';

import { type Chain } from './chain';
import { PATHS } from './paths';

// TEST, a coin other than SUI that anyone can mint (`move/test_coin`).
export type TestCoin = { type: string; faucetId: string };

// Builds and publishes the package. Global setup runs this once per run.
export async function publishTestCoin(
	chain: Chain,
): Promise<TestCoin> {
	const { modules, dependencies } = JSON.parse(
		execFileSync(
			'sui',
			[
				'move',
				'build',
				'--dump-bytecode-as-base64',
				'--path',
				PATHS.testCoinPackage,
			],
			// Piped so a failed build's output ends up in the error.
			{ encoding: 'utf8', stdio: 'pipe' },
		),
	) as { modules: string[]; dependencies: string[] };

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

// Mints one TEST coin per amount (in base units) to `address`.
export async function mintTestCoin(
	chain: Chain,
	address: string,
	amounts: bigint[],
) {
	const { type, faucetId } = testCoin();
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

function testCoin(): TestCoin {
	const type = process.env.E2E_TEST_COIN_TYPE;
	const faucetId = process.env.E2E_TEST_COIN_FAUCET;
	if (!type || !faucetId)
		throw new Error(
			'The test coin is published in global setup',
		);
	return { type, faucetId };
}
