// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export const compareStrings = (a: string, b: string) =>
	a < b ? -1 : a > b ? 1 : 0;

// One result of a DataLoader's `loadMany`, or its error thrown.
export const unwrap = <T>(result: T | Error): T => {
	if (result instanceof Error) throw result;
	return result;
};
