// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	fromBase64,
	normalizeSuiAddress,
	toHex,
} from '@mysten/sui/utils';

export const onChainAmountToFloat = (
	amount: string,
	decimals: number,
) => {
	const total = parseFloat(amount);

	return total / Math.pow(10, decimals);
};

export const formatAddress = (address: string) => {
	return `${address.slice(0, 6)}...${address.slice(-8)}`;
};

const SYSTEM_PACKAGES = [
	'0x1',
	'0x2',
	'0x3',
	'0x5',
] as const;

const SYSTEM_PACKAGE_MAP: [string, string][] =
	SYSTEM_PACKAGES.map((short) => [
		normalizeSuiAddress(short),
		short,
	]);

export function prettifyType(type: string): string {
	for (const [padded, short] of SYSTEM_PACKAGE_MAP) {
		type = type.split(padded).join(short);
	}
	return type;
}

function readUleb128(bytes: Uint8Array): {
	count: number | null;
	offset: number;
} {
	let count = 0;
	let shift = 0;
	let offset = 0;
	for (; offset < bytes.length && offset < 5; offset++) {
		const b = bytes[offset];
		count |= (b & 0x7f) << shift;
		shift += 7;
		if ((b & 0x80) === 0) {
			return { count, offset: offset + 1 };
		}
	}
	return { count: null, offset };
}

export type DecodedPure = { label: string; value: string };

/**
 * Best-effort BCS decoder for common pure value types.
 * Returns all plausible interpretations (most likely first) so the UI can
 * show alternatives when the encoding is ambiguous.
 *
 */
export function tryDecodePure(
	base64Bytes: string,
): DecodedPure[] {
	try {
		const bytes = fromBase64(base64Bytes);
		const view = new DataView(
			bytes.buffer,
			bytes.byteOffset,
			bytes.byteLength,
		);
		const candidates: DecodedPure[] = [];

		// --- Fixed-width scalar types ---

		if (bytes.length === 1) {
			if (bytes[0] === 0 || bytes[0] === 1) {
				candidates.push({
					label: 'bool',
					value: bytes[0] === 1 ? 'true' : 'false',
				});
			}
			candidates.push({
				label: 'u8',
				value: String(bytes[0]),
			});
		}

		if (bytes.length === 2)
			candidates.push({
				label: 'u16',
				value: String(view.getUint16(0, true)),
			});

		if (bytes.length === 4)
			candidates.push({
				label: 'u32',
				value: String(view.getUint32(0, true)),
			});

		if (bytes.length === 8)
			candidates.push({
				label: 'u64',
				value: String(view.getBigUint64(0, true)),
			});

		if (bytes.length === 16) {
			const lo = view.getBigUint64(0, true);
			const hi = view.getBigUint64(8, true);
			candidates.push({
				label: 'u128',
				value: String((hi << 64n) | lo),
			});
		}

		if (bytes.length === 32)
			candidates.push({
				label: 'address',
				value: `0x${toHex(bytes)}`,
			});

		// --- ULEB128 length-prefixed types ---

		if (bytes.length >= 2) {
			const { count, offset } = readUleb128(bytes);
			if (count !== null && count > 0) {
				const remaining = bytes.length - offset;

				if (remaining === count) {
					try {
						const payload = bytes.slice(offset);
						const decoded = new TextDecoder('utf-8', {
							fatal: true,
						}).decode(payload);
						if (/^[\x20-\x7e\t\n\r]+$/.test(decoded)) {
							candidates.push({
								label: 'string',
								value: decoded,
							});
						}
					} catch {
						// not valid UTF-8
					}

					candidates.push({
						label: 'vector<u8>',
						value: `[${Array.from(bytes.slice(offset)).join(', ')}]`,
					});
				}

				if (remaining === count * 8) {
					const items: string[] = [];
					for (let i = 0; i < count; i++) {
						items.push(
							String(
								view.getBigUint64(offset + i * 8, true),
							),
						);
					}
					candidates.push({
						label: 'vector<u64>',
						value: `[${items.join(', ')}]`,
					});
				}

				if (remaining === count * 32) {
					const items: string[] = [];
					for (let i = 0; i < count; i++) {
						const start = offset + i * 32;
						items.push(
							`0x${toHex(bytes.slice(start, start + 32))}`,
						);
					}
					candidates.push({
						label: 'vector<address>',
						value: `[${items.join(', ')}]`,
					});
				}
			}
		}

		return candidates;
	} catch {
		return [];
	}
}
