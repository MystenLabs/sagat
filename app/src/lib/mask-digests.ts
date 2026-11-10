// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { isValidTransactionDigest } from '@mysten/sui/utils';

const TOKEN = /[A-Za-z0-9]+/g;
const HEX = /^[0-9A-Fa-f]+$/;
const MAX_DEPTH = 10;

function isDigest(token: string) {
	return (
		token.length >= 32 &&
		token.length <= 44 &&
		isValidTransactionDigest(token)
	);
}

export function maskDigestsInText(text: string): string {
	return text.replace(TOKEN, (token, offset: number) => {
		if (isDigest(token)) return ':digest';
		if (text[offset - 1] !== '%') return token;
		// A percent escape glues its hex digits to the digest, e.g. %2F.
		const prefix = token.slice(0, 2);
		if (HEX.test(prefix) && isDigest(token.slice(2))) {
			return prefix + ':digest';
		}
		return token;
	});
}

export function maskDigests<T>(value: T): T {
	return copy(value, 0) as T;
}

function copy(value: unknown, depth: number): unknown {
	if (typeof value === 'string')
		return maskDigestsInText(value);
	if (depth >= MAX_DEPTH) return value;
	if (Array.isArray(value))
		return value.map((item) => copy(item, depth + 1));
	if (isPlainObject(value)) {
		const out: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value))
			out[key] = copy(item, depth + 1);
		return out;
	}
	return value;
}

function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object')
		return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
