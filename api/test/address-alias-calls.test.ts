// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Unit tests for spotting `0x2::address_alias` calls in a transaction (no
// database, no network).

import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { describe, expect, test } from 'bun:test';

import {
	ADDRESS_ALIAS_STATE_ID,
	buildAdd,
	buildEnable,
	buildRemove,
	findAddressAliasCalls,
} from '../src/utils/aliases';

const ACCOUNT = normalizeSuiAddress('0xacc');
const OTHER = normalizeSuiAddress('0xb0b');
const FRAMEWORK = normalizeSuiAddress('0x2');

/** Round-trips through JSON, like a transaction rebuilt from proposal bytes. */
const reload = (tx: Transaction) =>
	Transaction.from(tx.serialize());

describe('findAddressAliasCalls', () => {
	test('finds every alias call with its command index', () => {
		const tx = new Transaction();
		tx.setSender(ACCOUNT);
		const [coin] = tx.splitCoins(tx.gas, [1]);
		tx.transferObjects([coin], OTHER);
		buildEnable(tx);
		buildAdd(tx, { account: ACCOUNT, alias: OTHER });
		buildRemove(tx, { account: ACCOUNT, alias: ACCOUNT });

		expect(findAddressAliasCalls(reload(tx))).toEqual([
			{ index: 2, function: 'enable' },
			{ index: 3, function: 'add' },
			{ index: 4, function: 'remove' },
		]);
	});

	test('matches the short and the full framework address', () => {
		for (const pkg of ['0x2', FRAMEWORK]) {
			const tx = new Transaction();
			tx.moveCall({
				package: pkg,
				module: 'address_alias',
				function: 'replace_all',
				arguments: [
					tx.object(ADDRESS_ALIAS_STATE_ID),
					tx.pure.vector('address', [OTHER]),
				],
			});
			expect(findAddressAliasCalls(reload(tx))).toEqual([
				{ index: 0, function: 'replace_all' },
			]);
		}
		const target = new Transaction();
		target.moveCall({
			target: `${FRAMEWORK}::address_alias::add`,
			arguments: [target.pure.address(OTHER)],
		});
		expect(findAddressAliasCalls(target)).toEqual([
			{ index: 0, function: 'add' },
		]);
	});

	test('ignores other modules and other packages', () => {
		const tx = new Transaction();
		const [coin] = tx.splitCoins(tx.gas, [1]);
		tx.moveCall({
			target: '0x2::transfer::public_transfer',
			typeArguments: ['0x2::coin::Coin<0x2::sui::SUI>'],
			arguments: [coin, tx.pure.address(OTHER)],
		});
		tx.moveCall({
			target: `${normalizeSuiAddress('0x22')}::address_alias::add`,
		});
		expect(findAddressAliasCalls(reload(tx))).toEqual([]);
	});
});
