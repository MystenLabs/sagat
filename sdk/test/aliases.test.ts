// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
	Transaction,
	type TransactionArgument,
} from '@mysten/sui/transactions';
import { describe, expect, test } from 'bun:test';

import {
	ADDRESS_ALIAS_STATE_ID,
	deriveAliasesObjectId,
	findAliasCalls,
} from '../src/index.js';

const account = new Ed25519Keypair().toSuiAddress();
const [first, second] = [
	new Ed25519Keypair().toSuiAddress(),
	new Ed25519Keypair().toSuiAddress(),
];
const aliasesObject = deriveAliasesObjectId(account);

const call = (
	tx: Transaction,
	fn: string,
	argument?: TransactionArgument,
) =>
	tx.moveCall({
		target: `0x2::address_alias::${fn}`,
		arguments:
			argument === undefined
				? [tx.object(aliasesObject)]
				: [tx.object(aliasesObject), argument],
	});

describe('findAliasCalls', () => {
	test('reads each alias function with its argument, in command order', () => {
		const tx = new Transaction();
		tx.moveCall({
			target: '0x2::address_alias::enable',
			arguments: [tx.object(ADDRESS_ALIAS_STATE_ID)],
		});
		call(tx, 'add', tx.pure.address(first));
		call(tx, 'remove', tx.pure.address(second));
		call(
			tx,
			'replace_all',
			tx.pure.vector('address', [first, second]),
		);

		expect(findAliasCalls(tx.getData())).toEqual([
			{ function: 'enable', aliases: [] },
			{ function: 'add', aliases: [first] },
			{ function: 'remove', aliases: [second] },
			{ function: 'replace_all', aliases: [first, second] },
		]);
	});

	test('finds nothing in a transaction without an alias call, also with a call to another framework module', () => {
		const tx = new Transaction();
		const [coin] = tx.splitCoins(tx.gas, [1]);
		tx.transferObjects([coin], first);
		tx.moveCall({
			target: '0x2::coin::zero',
			typeArguments: ['0x2::sui::SUI'],
		});

		expect(findAliasCalls(tx.getData())).toEqual([]);
	});

	test('gives null aliases for an argument that is not a decodable pure input', () => {
		const tx = new Transaction();
		call(tx, 'add', tx.pure.u8(1));
		call(
			tx,
			'remove',
			tx.pure(bcs.vector(bcs.Address).serialize([first])),
		);
		call(tx, 'replace_all', tx.gas);
		call(tx, 'add');

		expect(findAliasCalls(tx.getData())).toEqual([
			{ function: 'add', aliases: null },
			{ function: 'remove', aliases: null },
			{ function: 'replace_all', aliases: null },
			{ function: 'add', aliases: null },
		]);
	});
});
