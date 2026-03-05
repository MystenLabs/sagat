// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import { toBase64 } from '@mysten/sui/utils';
import { describe, expect, test } from 'vitest';

import {
	type DecodedPure,
	tryDecodePure,
} from '../src/components/preview-effects/utils';

function serialize(
	type: {
		serialize: (v: any) => { toBase64: () => string };
	},
	value: unknown,
) {
	return type.serialize(value).toBase64();
}

function labels(results: DecodedPure[]) {
	return results.map((r) => r.label);
}

describe('tryDecodePure', () => {
	// --- Unambiguous scalars ---

	test('decodes u8 (non-boolean value)', () => {
		const results = tryDecodePure(serialize(bcs.u8(), 42));
		expect(results).toEqual([{ label: 'u8', value: '42' }]);
	});

	test('decodes u16', () => {
		const results = tryDecodePure(serialize(bcs.u16(), 256));
		expect(results).toEqual([{ label: 'u16', value: '256' }]);
	});

	test('decodes u32', () => {
		const results = tryDecodePure(
			serialize(bcs.u32(), 1_000_000),
		);
		expect(results).toEqual([
			{ label: 'u32', value: '1000000' },
		]);
	});

	test('decodes u64', () => {
		const results = tryDecodePure(
			serialize(bcs.u64(), 1_000_000_000n),
		);
		expect(results).toEqual([
			{ label: 'u64', value: '1000000000' },
		]);
	});

	test('decodes u64 max', () => {
		const maxU64 = (1n << 64n) - 1n;
		const results = tryDecodePure(
			serialize(bcs.u64(), maxU64),
		);
		expect(results).toEqual([
			{ label: 'u64', value: '18446744073709551615' },
		]);
	});

	test('decodes u128 small value', () => {
		const results = tryDecodePure(
			serialize(bcs.u128(), 1n),
		);
		expect(results).toEqual([
			{ label: 'u128', value: '1' },
		]);
	});

	test('decodes u128 larger than u64 range', () => {
		const val = 1n << 64n;
		const results = tryDecodePure(
			serialize(bcs.u128(), val),
		);
		expect(results).toEqual([
			{ label: 'u128', value: val.toString() },
		]);
	});

	test('decodes address', () => {
		const addr = '0x' + '00'.repeat(31) + '42';
		const addrBytes = Uint8Array.from(
			addr
				.slice(2)
				.match(/.{2}/g)!
				.map((h) => parseInt(h, 16)),
		);
		const results = tryDecodePure(
			serialize(bcs.bytes(32), addrBytes),
		);
		expect(results).toEqual([
			{ label: 'address', value: addr },
		]);
	});

	// --- Unambiguous length-prefixed types ---

	test('decodes string', () => {
		const results = tryDecodePure(
			serialize(bcs.string(), 'hello'),
		);
		expect(labels(results)).toEqual([
			'string',
			'vector<u8>',
		]);
		expect(results[0]).toEqual({
			label: 'string',
			value: 'hello',
		});
	});

	test('decodes a longer string', () => {
		const text =
			'The quick brown fox jumps over the lazy dog';
		const results = tryDecodePure(
			serialize(bcs.string(), text),
		);
		expect(results[0]).toEqual({
			label: 'string',
			value: text,
		});
	});

	test('decodes vector<u8> (non-colliding length)', () => {
		const items = [
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
			15, 16, 17,
		];
		const results = tryDecodePure(
			serialize(bcs.vector(bcs.u8()), items),
		);
		expect(results).toEqual([
			{
				label: 'vector<u8>',
				value: '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]',
			},
		]);
	});

	test('decodes vector<u64>', () => {
		const results = tryDecodePure(
			serialize(bcs.vector(bcs.u64()), [100n, 200n, 300n]),
		);
		expect(results).toEqual([
			{
				label: 'vector<u64>',
				value: '[100, 200, 300]',
			},
		]);
	});

	test('decodes vector<u64> with large values', () => {
		const vals = [1_000_000_000n, (1n << 64n) - 1n];
		const results = tryDecodePure(
			serialize(bcs.vector(bcs.u64()), vals),
		);
		expect(results).toEqual([
			{
				label: 'vector<u64>',
				value: '[1000000000, 18446744073709551615]',
			},
		]);
	});

	test('decodes vector<address>', () => {
		const addr1 = '0x' + '00'.repeat(31) + '01';
		const addr2 = '0x' + '00'.repeat(31) + 'ff';
		const toAddrBytes = (a: string) =>
			Uint8Array.from(
				a
					.slice(2)
					.match(/.{2}/g)!
					.map((h) => parseInt(h, 16)),
			);

		const results = tryDecodePure(
			serialize(bcs.vector(bcs.bytes(32)), [
				toAddrBytes(addr1),
				toAddrBytes(addr2),
			]),
		);
		expect(results).toEqual([
			{
				label: 'vector<address>',
				value: `[${addr1}, ${addr2}]`,
			},
		]);
	});

	// --- Ambiguous cases: multiple candidates ---

	test('bool(true) is ambiguous with u8(1)', () => {
		const results = tryDecodePure(
			serialize(bcs.bool(), true),
		);
		expect(labels(results)).toEqual(['bool', 'u8']);
		expect(results[0]).toEqual({
			label: 'bool',
			value: 'true',
		});
		expect(results[1]).toEqual({
			label: 'u8',
			value: '1',
		});
	});

	test('bool(false) is ambiguous with u8(0)', () => {
		const results = tryDecodePure(
			serialize(bcs.bool(), false),
		);
		expect(labels(results)).toEqual(['bool', 'u8']);
	});

	test('31-char string is ambiguous with address', () => {
		const text = 'abcdefghijklmnopqrstuvwxyz01234';
		const results = tryDecodePure(
			serialize(bcs.string(), text),
		);
		expect(labels(results)).toEqual([
			'address',
			'string',
			'vector<u8>',
		]);
		expect(results[1]).toEqual({
			label: 'string',
			value: text,
		});
	});

	test('short vector<u8> is ambiguous with u32', () => {
		const results = tryDecodePure(
			serialize(bcs.vector(bcs.u8()), [10, 20, 30]),
		);
		expect(labels(results)).toContain('u32');
	});

	test('string also reports vector<u8> as alternative', () => {
		const results = tryDecodePure(
			serialize(bcs.string(), 'hello'),
		);
		expect(labels(results)).toEqual([
			'string',
			'vector<u8>',
		]);
	});

	test('non-printable payload only shows vector<u8>', () => {
		const raw = new Uint8Array([
			5, 0x00, 0x01, 0x02, 0x03, 0x04,
		]);
		const results = tryDecodePure(toBase64(raw));
		expect(results).toEqual([
			{
				label: 'vector<u8>',
				value: '[0, 1, 2, 3, 4]',
			},
		]);
	});

	// --- Empty / invalid ---

	test('returns empty array for empty bytes', () => {
		expect(
			tryDecodePure(toBase64(new Uint8Array(0))),
		).toEqual([]);
	});

	test('returns empty array for invalid base64', () => {
		expect(tryDecodePure('%%%not-base64%%%')).toEqual([]);
	});

	test('returns empty array when ULEB length mismatches', () => {
		const raw = new Uint8Array([
			10, 0x41, 0x42, 0x43, 0x44,
		]);
		expect(tryDecodePure(toBase64(raw))).toEqual([]);
	});
});
