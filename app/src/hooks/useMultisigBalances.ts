// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import type { SuiClientTypes } from '@mysten/sui/client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useNetwork } from '../contexts/NetworkContext';
import { QueryKeys } from '../lib/queryKeys';

export type Balance = SuiClientTypes.Balance;

// Server caps `pageSize` at 50; chain a few calls per react-query page
// so the initial load is large enough for a stable client-side sort.
const PER_PAGE = 50;
const BATCHES_PER_PAGE = 5;
const STALE_TIME_MS = 30_000;

interface BalancesPage {
	balances: Balance[];
	cursor: string | null;
	hasNextPage: boolean;
}

export function useMultisigBalances(owner: string) {
	const client = useDAppKit().getClient();
	const { network } = useNetwork();

	const query = useInfiniteQuery({
		queryKey: [QueryKeys.Balances, network, owner],
		queryFn: async ({
			pageParam,
		}): Promise<BalancesPage> => {
			const balances: Balance[] = [];
			let cursor: string | null = pageParam;
			let hasNextPage = false;

			for (let i = 0; i < BATCHES_PER_PAGE; i++) {
				const result = await client.listBalances({
					owner,
					cursor,
					limit: PER_PAGE,
				});
				balances.push(...result.balances);
				hasNextPage = result.hasNextPage;
				cursor = result.cursor;
				if (!hasNextPage) break;
			}

			return { balances, cursor, hasNextPage };
		},
		initialPageParam: null as string | null,
		getNextPageParam: (lastPage) =>
			lastPage.hasNextPage ? lastPage.cursor : undefined,
		staleTime: STALE_TIME_MS,
		refetchOnWindowFocus: true,
	});

	const balances = useMemo<Balance[]>(() => {
		if (!query.data) return [];
		return query.data.pages.flatMap(
			(page) => page.balances,
		);
	}, [query.data]);

	return { ...query, balances };
}
