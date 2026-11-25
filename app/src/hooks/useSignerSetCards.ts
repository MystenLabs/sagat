// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from 'react';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useGetMultisig } from '@/hooks/useGetMultisig';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import { shownActingSets } from '@/lib/proposal-integrity';
import { signerSetCards } from '@/lib/signer-sets';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

/** A card per acting set, the viewer's first; null until rule 2 passed. */
export function useSignerSetCards(
	multisig: MultisigWithMembersForPublicKey | undefined,
) {
	const { currentAddress } = useApiAuth();
	const account = multisig?.address;
	const { data: details } = useGetMultisig(account);
	const { data: pods } = useUserMultisigs();
	const signerAddress = currentAddress?.address;
	const acting =
		multisig?.acting?.state === 'ok'
			? multisig.acting
			: null;
	return useMemo(
		() =>
			acting
				? signerSetCards({
						acting: acting.signerSets,
						fresh: details ? shownActingSets(details) : [],
						account: account ?? '',
						pods: pods ?? [],
						signerAddress,
					})
				: null,
		[acting, details, account, pods, signerAddress],
	);
}
