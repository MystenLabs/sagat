// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import { normalizeStructTag } from '@mysten/sui/utils';
import { describe, expect, test } from 'vitest';

import { objectView } from '../src/lib/systemObjects';

// The framework's layouts (sui-framework `package.move`, `kiosk.move`,
// `transfer_policy.move`, `coin.move`, `display.move`), written out here
// so the bytes are built independently of the module under test.
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
const TransferPolicyCap = bcs.struct('TransferPolicyCap', {
	id: UID,
	policy_id: bcs.Address,
});
const TreasuryCap = bcs.struct('TreasuryCap', {
	id: UID,
	total_supply: bcs.struct('Supply', { value: bcs.u64() }),
});
const Display = bcs.struct('Display', {
	id: UID,
	fields: bcs.struct('VecMap', {
		contents: bcs.vector(
			bcs.struct('Entry', {
				key: bcs.string(),
				value: bcs.string(),
			}),
		),
	}),
	version: bcs.u16(),
});
const CoinMetadata = bcs.struct('CoinMetadata', {
	id: UID,
	decimals: bcs.u8(),
	name: bcs.string(),
	symbol: bcs.string(),
	description: bcs.string(),
	icon_url: bcs.option(
		bcs.struct('Url', { url: bcs.string() }),
	),
});

const id = (byte: string) => `0x${byte.repeat(32)}`;
const OBJECT = id('01');
const PACKAGE = id('a4');
const PUSD = `${id('c0')}::pusd::PUSD`;
const USDC = `${id('db')}::usdc::USDC`;
const HERO = `${id('9e')}::nft::Hero`;

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
				{ kind: 'id', id: PACKAGE },
				{ kind: 'text', text: 'version 1' },
				{ kind: 'text', text: 'Compatible' },
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
				{ kind: 'id', id: PACKAGE },
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
			subtitle: [{ kind: 'id', id: kiosk }],
		});
	});

	test('a TreasuryCap shows a coin outside the registry with its package', () => {
		const content = TreasuryCap.serialize({
			id: OBJECT,
			total_supply: { value: 5n },
		}).toBytes();
		expect(
			view(`0x2::coin::TreasuryCap<${PUSD}>`, content),
		).toEqual({
			kind: 'treasuryCap',
			name: 'TreasuryCap',
			subtitle: [
				{ kind: 'text', text: '0xc0c0…c0c0::pusd::PUSD' },
			],
		});
	});

	test("a CoinMetadata shows a recognised coin's symbol", () => {
		const content = CoinMetadata.serialize({
			id: OBJECT,
			decimals: 6,
			name: 'Fake USD',
			symbol: 'FUSD',
			description: '',
			icon_url: null,
		}).toBytes();
		expect(
			view(`0x2::coin::CoinMetadata<${USDC}>`, content),
		).toEqual({
			kind: 'coinMetadata',
			name: 'CoinMetadata',
			subtitle: [{ kind: 'text', text: 'USDC' }],
		});
	});

	test('a Display shows the type it is for', () => {
		const content = Display.serialize({
			id: OBJECT,
			fields: {
				contents: [{ key: 'name', value: '{name}' }],
			},
			version: 1,
		}).toBytes();
		expect(
			view(`0x2::display::Display<${HERO}>`, content),
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
				content,
			).subtitle,
		).toEqual([{ kind: 'text', text: 'Kiosk' }]);
	});

	test('a TransferPolicyCap shows the type it is for', () => {
		const content = TransferPolicyCap.serialize({
			id: OBJECT,
			policy_id: id('7d'),
		}).toBytes();
		expect(
			view(
				`0x2::transfer_policy::TransferPolicyCap<${HERO}>`,
				content,
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
