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
		// Percent escapes glue their hex digits to the digest, e.g. %2F or %252F.
		for (const n of [2, 4, 6]) {
			const prefix = token.slice(0, n);
			if (HEX.test(prefix) && isDigest(token.slice(n))) {
				return prefix + ':digest';
			}
		}
		return token;
	});
}

export function maskDigests<T>(value: T): T {
	walk(value, 0);
	return value;
}

function walk(value: unknown, depth: number) {
	if (depth >= MAX_DEPTH) return;
	if (Array.isArray(value)) {
		value.forEach((item, i) => {
			if (typeof item === 'string')
				value[i] = maskDigestsInText(item);
			else walk(item, depth + 1);
		});
	} else if (isPlainObject(value)) {
		for (const [key, item] of Object.entries(value)) {
			if (typeof item === 'string')
				value[key] = maskDigestsInText(item);
			else walk(item, depth + 1);
		}
	}
}

function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object')
		return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
