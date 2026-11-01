// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import { normalizeStructTag } from '@mysten/sui/utils';
import { describe, expect, test } from 'vitest';

import { objectView } from '../src/lib/systemObjects';

// The framework's layouts (sui-framework `package.move`, `kiosk.move`),
// written out here so the bytes are built independently of the module
// under test. The other system types are described by their type alone,
// so their content can be empty.
const UID = bcs.Address;
const UpgradeCap = bcs.struct('UpgradeCap', {
	id: UID,
	package: bcs.Address,
	version: bcs.u64(),
	policy: bcs.u8(),
});
const Publisher = bcs.struct('Publisher', {
	id: UID,
	package: bcs.string(),
	module_name: bcs.string(),
});
const KioskOwnerCap = bcs.struct('KioskOwnerCap', {
	id: UID,
	for: bcs.Address,
});
const id = (byte: string) => `0x${byte.repeat(32)}`;
const OBJECT = id('01');
const PACKAGE = id('a4');
const PUSD = `${id('c0')}::pusd::PUSD`;
const USDC = `${id('db')}::usdc::USDC`;
const HERO = `${id('9e')}::nft::Hero`;
const NO_CONTENT = new Uint8Array();

// The registry knows USDC alone.
const coinSymbol = (coinType: string) =>
	coinType === normalizeStructTag(USDC)
		? 'USDC'
		: undefined;

function view(
	type: string,
	content: Uint8Array,
	display: Record<string, unknown> | null = null,
) {
	const { kind, name, subtitle } = objectView(
		{
			objectId: OBJECT,
			type,
			content,
			display: display && { output: display },
		},
		coinSymbol,
	);
	return { kind, name, subtitle };
}

describe('objectView', () => {
	test('an UpgradeCap shows its package, version and policy', () => {
		const content = UpgradeCap.serialize({
			id: OBJECT,
			package: PACKAGE,
			version: 1n,
			policy: 0,
		}).toBytes();
		expect(
			view('0x2::package::UpgradeCap', content),
		).toEqual({
			kind: 'upgradeCap',
			name: 'UpgradeCap',
			subtitle: [
				{ kind: 'text', text: 'version 1' },
				{ kind: 'text', text: 'Compatible' },
				{ kind: 'id', label: 'package', id: PACKAGE },
			],
		});
	});

	test('a Publisher shows its module and package', () => {
		const content = Publisher.serialize({
			id: OBJECT,
			package: 'a4'.repeat(32),
			module_name: 'vault',
		}).toBytes();
		expect(
			view('0x2::package::Publisher', content),
		).toEqual({
			kind: 'publisher',
			name: 'Publisher',
			subtitle: [
				{ kind: 'text', text: 'vault' },
				{ kind: 'id', label: 'package', id: PACKAGE },
			],
		});
	});

	test('a KioskOwnerCap shows its kiosk', () => {
		const kiosk = id('2c');
		const content = KioskOwnerCap.serialize({
			id: OBJECT,
			for: kiosk,
		}).toBytes();
		expect(
			view('0x2::kiosk::KioskOwnerCap', content),
		).toEqual({
			kind: 'kioskOwnerCap',
			name: 'KioskOwnerCap',
			subtitle: [{ kind: 'id', label: 'kiosk', id: kiosk }],
		});
	});

	test('a TreasuryCap shows a coin outside the registry with its package', () => {
		expect(
			view(`0x2::coin::TreasuryCap<${PUSD}>`, NO_CONTENT),
		).toEqual({
			kind: 'treasuryCap',
			name: 'TreasuryCap',
			subtitle: [
				{ kind: 'text', text: '0xc0c0…c0c0::pusd::PUSD' },
			],
		});
	});

	test("a CoinMetadata shows a recognised coin's symbol", () => {
		expect(
			view(`0x2::coin::CoinMetadata<${USDC}>`, NO_CONTENT),
		).toEqual({
			kind: 'coinMetadata',
			name: 'CoinMetadata',
			subtitle: [{ kind: 'text', text: 'USDC' }],
		});
	});

	test('a Display shows the type it is for', () => {
		expect(
			view(`0x2::display::Display<${HERO}>`, NO_CONTENT),
		).toEqual({
			kind: 'display',
			name: 'Display',
			subtitle: [
				{ kind: 'text', text: '0x9e9e…9e9e::nft::Hero' },
			],
		});
		// A framework type goes by its name alone.
		expect(
			view(
				'0x2::display::Display<0x2::kiosk::Kiosk>',
				NO_CONTENT,
			).subtitle,
		).toEqual([{ kind: 'text', text: 'Kiosk' }]);
	});

	test('a TransferPolicyCap shows the type it is for', () => {
		expect(
			view(
				`0x2::transfer_policy::TransferPolicyCap<${HERO}>`,
				NO_CONTENT,
			),
		).toEqual({
			kind: 'transferPolicyCap',
			name: 'TransferPolicyCap',
			subtitle: [
				{ kind: 'text', text: '0x9e9e…9e9e::nft::Hero' },
			],
		});
	});

	test('any other object shows its Display name, else its struct, over its module', () => {
		const type = `${PACKAGE}::vault::AdminCap`;
		const content = new Uint8Array(32);
		expect(
			view(type, content, {
				name: 'Vault admin',
				image_url: 'https://example.test/admin.png',
			}),
		).toEqual({
			kind: 'other',
			name: 'Vault admin',
			subtitle: [{ kind: 'text', text: 'vault' }],
		});
		expect(view(type, content).name).toBe('AdminCap');
	});
});
