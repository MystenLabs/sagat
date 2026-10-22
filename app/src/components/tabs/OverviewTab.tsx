// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useOutletContext } from 'react-router-dom';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useAccountAssets } from '@/hooks/useAccountAssets';
import { useGetMultisig } from '@/hooks/useGetMultisig';
import { accountSetup } from '@/lib/account-setup';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { accountName } from '../invitations/account-name';
import { AccountValue } from '../multisig/AccountValue';
import { OpenProposals } from '../multisig/OpenProposals';
import { TokensCard } from '../multisig/TokensCard';
import { type ProposalIntent } from '../ProposalSheet';
import { Stat } from '../ui/stat';

interface OverviewTabContext {
	multisig: MultisigWithMembersForPublicKey;
	openProposalSheet: (intent?: ProposalIntent) => void;
}

/** Stats on the strip share a row once the card is wide enough. */
const stat = {
	size: 'md',
	className: '@3xl:min-w-fit @3xl:flex-1',
} as const;

/**
 * The account at a glance: what it holds in USD with Receive and Send,
 * its threshold against the signers' weight and how many signers it has,
 * then the proposals still open beside its largest holdings.
 */
export function OverviewTab() {
	const { multisig, openProposalSheet } =
		useOutletContext<OverviewTabContext>();
	const { currentAddress } = useApiAuth();
	const { data: details } = useGetMultisig(
		multisig.address,
	);
	const assets = useAccountAssets(multisig.address);
	const account = details ?? multisig;
	const setup = accountSetup({
		multisig: account,
		currentAddress: currentAddress?.address,
	});

	return (
		<div className="@container flex flex-col gap-7">
			<AccountValue
				address={multisig.address}
				name={accountName(multisig)}
				value={assets.value}
				isLoading={assets.isLoading}
				isError={assets.isError}
				onSend={() =>
					openProposalSheet({ kind: 'transfer' })
				}
			/>
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
			<div className="grid min-w-0 gap-6 @4xl:grid-cols-[minmax(0,1fr)_400px]">
				<OpenProposals multisig={multisig} />
				<TokensCard
					address={multisig.address}
					assets={assets}
				/>
			</div>
		</div>
	);
}
