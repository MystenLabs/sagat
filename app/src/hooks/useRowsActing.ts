// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { normalizeSuiAddress } from '@mysten/sui/utils';
import { useMemo } from 'react';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { withActing } from '@/lib/user-multisig';

import { useAliasSets } from './useAliasSets';

/** The rows with rule 2 on the selected network, from one alias read for all of them. */
export function useRowsActing(
	rows: MultisigWithMembersForPublicKey[] | undefined,
) {
	const pods = useMemo(
		() =>
			(rows ?? [])
				.filter((row) => !row.refused)
				.map((row) => row.address),
		[rows],
	);
	const { aliases } = useAliasSets(pods);
	const { currentAddress } = useApiAuth();
	return useMemo(
		() =>
			currentAddress
				? rows?.map((row) =>
						withActing(
							row,
							aliases?.get(
								normalizeSuiAddress(row.address),
							),
							currentAddress,
						),
					)
				: rows,
		[rows, aliases, currentAddress],
	);
}
