// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useOutletContext } from 'react-router-dom';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useGetMultisig } from '@/hooks/useGetMultisig';
import { accountSetup } from '@/lib/account-setup';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { OpenProposals } from '../multisig/OpenProposals';
import { Stat } from '../ui/stat';

interface OverviewTabContext {
	multisig: MultisigWithMembersForPublicKey;
}

/** Stats on the strip share a row once the card is wide enough. */
const stat = {
	size: 'md',
	className: '@3xl:min-w-fit @3xl:flex-1',
} as const;

/**
 * The account at a glance: its threshold against the signers' weight and
 * how many signers it has, then the proposals still open. The value stats
 * and the token table of the design wait for balances and prices.
 */
export function OverviewTab() {
	const { multisig } =
		useOutletContext<OverviewTabContext>();
	const { currentAddress } = useApiAuth();
	const { data: details } = useGetMultisig(
		multisig.address,
	);
	const account = details ?? multisig;
	const setup = accountSetup({
		multisig: account,
		currentAddress: currentAddress?.address,
	});

	return (
		<div className="@container flex flex-col gap-7">
			<dl
				className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl border bg-card p-5 md:p-6 @3xl:flex @3xl:gap-8"
				data-testid="account-summary"
			>
				<Stat {...stat} label="Threshold">
					<span
						data-testid="multisig-threshold"
						data-threshold={account.threshold}
						data-total-weight={setup.totalWeight}
					>
						{setup.thresholdLabel}
					</span>
				</Stat>
				<Stat {...stat} label="Signers">
					<span data-testid="account-signers">
						{setup.signerCount}
					</span>
				</Stat>
			</dl>
			<OpenProposals multisig={multisig} />
		</div>
	);
}
