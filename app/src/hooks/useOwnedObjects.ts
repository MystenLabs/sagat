// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import type { SuiClientTypes } from '@mysten/sui/client';
import { useQuery } from '@tanstack/react-query';

import { useNetwork } from '../contexts/NetworkContext';
import {
	fillPage,
	NODE_PAGE_SIZE,
	OBJECTS_PAGE_SIZE,
	objectsFilterKey,
	objectsQuery,
	type ObjectsFilter,
	type PageStart,
} from '../lib/owned-objects';
import { QueryKeys } from '../lib/queryKeys';

const STALE_TIME_MS = 30_000;

const INCLUDE = { content: true, display: true } as const;
export type OwnedObject = SuiClientTypes.Object<
	typeof INCLUDE
>;

/**
 * One page of the objects `owner` owns that `filter` lets through, coins
 * left out, with each object's content and Display for describing it, and
 * where the next page starts.
 */
export function useOwnedObjects(
	owner: string,
	filter: ObjectsFilter,
	start: PageStart,
) {
	const client = useDAppKit().getClient();
	const { network } = useNetwork();

	return useQuery({
		queryKey: [
			QueryKeys.OwnedObjects,
			network,
			owner,
			objectsFilterKey(filter),
			start.cursor,
			start.skip,
		],
		queryFn: ({ signal }) => {
			const { type, keep } = objectsQuery(filter);
			return fillPage<OwnedObject>({
				start,
				size: OBJECTS_PAGE_SIZE,
				keep: (object) => keep(object.type),
				fetchNodePage: (cursor) =>
					client.listOwnedObjects({
						owner,
						type,
						cursor,
						limit: NODE_PAGE_SIZE,
						include: INCLUDE,
						signal,
					}),
			});
		},
		staleTime: STALE_TIME_MS,
	});
}
