// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { normalizeSuiNSName } from '@mysten/sui/utils';
import { useQuery } from '@tanstack/react-query';

import { useNetwork } from '../contexts/NetworkContext';
import { QueryKeys } from '../lib/queryKeys';

const SUINS_NAME_STALE_TIME = 5 * 60 * 1000;

export function useDefaultSuinsName(
	address: string | null | undefined,
) {
	const client = useDAppKit().getClient();
	const { network } = useNetwork();

	return useQuery({
		queryKey: [
			QueryKeys.SuinsDefaultName,
			network,
			address,
		],
		queryFn: async () => {
			const result = await client.defaultNameServiceName({
				address: address!,
			});
			return result.data.name
				? normalizeSuiNSName(result.data.name, 'at')
				: null;
		},
		enabled: !!address,
		staleTime: SUINS_NAME_STALE_TIME,
		gcTime: SUINS_NAME_STALE_TIME,
		retry: false,
	});
}
