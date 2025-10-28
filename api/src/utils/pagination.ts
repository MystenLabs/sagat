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

// Create a new cursor with the default limit if not provided.
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
			perPage &&
			!isNaN(Number(perPage)) &&
			Number(perPage) <= LIMITS.maxProposalsPerPage
				? Number(perPage)
				: LIMITS.maxProposalsPerPage,
	};
};
