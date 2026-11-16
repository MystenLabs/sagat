// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { LIMITS } from '../constants/limits';

export type PaginationCursor = {
	nextCursor?: string;
	perPage: number;
};

export type PaginatedResponse<T> = {
	data: T[];
	hasNextPage: boolean;
} & PaginationCursor;

export const paginateResponse = <T>(
	data: T[],
	perPage: number,
	hasNextPage: boolean,
	nextCursor?: string,
): PaginatedResponse<T> => {
	return {
		data,
		nextCursor,
		perPage,
		hasNextPage,
	};
};

// `value` as a whole number from 1 to `max`, or undefined.
export const wholeNumberUpTo = (
	value: unknown,
	max: number,
): number | undefined => {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 && n <= max
		? n
		: undefined;
};

// Page size is a positive integer up to the maximum, else the default.
export const newCursor = ({
	nextCursor,
	perPage,
}: {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	nextCursor?: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	perPage?: any;
}): PaginationCursor => {
	return {
		nextCursor,
		perPage:
			wholeNumberUpTo(
				perPage,
				LIMITS.maxProposalsPerPage,
			) ?? LIMITS.maxProposalsPerPage,
	};
};
