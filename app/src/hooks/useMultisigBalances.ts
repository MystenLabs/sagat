// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import type { SuiClientTypes } from '@mysten/sui/client';
import { SUI_TYPE_ARG } from '@mysten/sui/utils';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useNetwork } from '../contexts/NetworkContext';
import { QueryKeys } from '../lib/queryKeys';

export type Balance = SuiClientTypes.Balance;

const DEFAULT_PAGE_SIZE = 50;

/**
 * Sort balances so that SUI is always first, then by balance value (desc),
 * then by coin type (asc) as a tiebreaker.
 *
 * Applied across all loaded pages so order stays stable as pages are
 * appended via "Load more".
 */
function sortBalances(balances: Balance[]): Balance[] {
	return [...balances].sort((a, b) => {
		if (a.coinType === SUI_TYPE_ARG) return -1;
		if (b.coinType === SUI_TYPE_ARG) return 1;

		try {
			const diff = BigInt(b.balance) - BigInt(a.balance);
			if (diff !== 0n) return diff > 0n ? 1 : -1;
		} catch {
			// fall through to lexical sort
		}

		return a.coinType.localeCompare(b.coinType);
	});
}

/**
 * Fetches coin balances held by `owner` (e.g. a multisig address) one
 * page at a time. The first page renders immediately; subsequent pages
 * are loaded explicitly via `fetchNextPage`.
 *
 * Returns the underlying `useInfiniteQuery` result plus a memoised
 * `balances` array that flattens + sorts every loaded page, so callers
 * don't have to know about page boundaries.
 */
export function useMultisigBalances(
	owner: string | undefined,
	options?: { perPage?: number },
) {
	const client = useDAppKit().getClient();
	const { network } = useNetwork();
	const perPage = options?.perPage ?? DEFAULT_PAGE_SIZE;

	const query = useInfiniteQuery({
		queryKey: [QueryKeys.Balances, network, owner, perPage],
		queryFn: ({ pageParam }) =>
			client.listBalances({
				owner: owner!,
				cursor: pageParam,
				limit: perPage,
			}),
		initialPageParam: null as string | null,
		getNextPageParam: (lastPage) =>
			lastPage.hasNextPage ? lastPage.cursor : undefined,
		enabled: !!owner,
		staleTime: 30 * 1000,
		refetchOnWindowFocus: true,
	});

	const balances = useMemo(() => {
		if (!query.data) return [] as Balance[];
		return sortBalances(
			query.data.pages.flatMap((page) => page.balances),
		);
	}, [query.data]);

	return { ...query, balances };
}
