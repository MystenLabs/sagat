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
	nextCursor?: any;
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
