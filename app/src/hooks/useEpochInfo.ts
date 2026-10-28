// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { useQuery } from '@tanstack/react-query';

import { useNetwork } from '../contexts/NetworkContext';
import { type EpochInfo } from '../lib/expiration';
import { QueryKeys } from '../lib/queryKeys';

// The current epoch, when it started and how long epochs last.
export async function fetchEpochInfo(
	client: ClientWithCoreApi,
): Promise<EpochInfo> {
	const { systemState } =
		await client.core.getCurrentSystemState();
	return {
		epoch: systemState.epoch,
		epochStartTimestampMs:
			systemState.epochStartTimestampMs,
		epochDurationMs: systemState.parameters.epochDurationMs,
	};
}

export function useEpochInfo() {
	const client = useDAppKit().getClient();
	const { network } = useNetwork();

	return useQuery({
		queryKey: [QueryKeys.EpochInfo, network],
		queryFn: () => fetchEpochInfo(client),
		refetchInterval: 60_000,
	});
}
