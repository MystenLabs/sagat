// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from 'react';

import { getExpiry } from '../lib/expiration';
import { useEpochInfo } from './useEpochInfo';

// When a transaction stops being executable, or null if it never does (or
// the epoch isn't known yet).
export function useExpiry(transactionBytes: string) {
	const { data: epochInfo } = useEpochInfo();
	return useMemo(
		() =>
			epochInfo
				? getExpiry(transactionBytes, epochInfo)
				: null,
		[transactionBytes, epochInfo],
	);
}
