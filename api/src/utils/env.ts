// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/** The value, or `undefined` when unset or empty. */
export const optionalEnv = (name: string) =>
	process.env[name] || undefined;

export const requiredEnv = (
	name: string,
	message = `${name} is not set`,
) => {
	const value = optionalEnv(name);
	if (value === undefined) throw new Error(message);
	return value;
};

/** Comma-separated and trimmed. */
export const requiredListEnv = (
	name: string,
	message = `${name} is not set`,
) =>
	requiredEnv(name, message)
		.split(',')
		.map((item) => item.trim());

export const wholeNumberEnv = (
	name: string,
	fallback: number,
	least: number,
) => {
	const value = optionalEnv(name);
	if (value === undefined) return fallback;
	if (!/^\d+$/.test(value) || Number(value) < least)
		throw new Error(
			`${name} must be a whole number of ${least} or more, got "${value}"`,
		);
	return Number(value);
};
