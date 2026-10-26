// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useOutletContext } from 'react-router-dom';

import { useAccountAssets } from '@/hooks/useAccountAssets';
import { accountName } from '@/lib/account-name';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { AccountValue } from '../multisig/AccountValue';
import { OpenProposals } from '../multisig/OpenProposals';
import {
	TOKENS_SHOWN,
	TokensCard,
} from '../multisig/TokensCard';
import { type ProposalIntent } from '../ProposalSheet';

interface OverviewTabContext {
	multisig: MultisigWithMembersForPublicKey;
	openProposalSheet: (intent?: ProposalIntent) => void;
}

/**
 * The account at a glance: what it holds in USD with Receive and Send,
 * its largest holdings, then the proposals still open.
 */
export function OverviewTab() {
	const { multisig, openProposalSheet } =
		useOutletContext<OverviewTabContext>();
	const assets = useAccountAssets(multisig.address, {
		allPages: true,
		displayCount: TOKENS_SHOWN,
	});

	return (
		<div className="@container flex flex-col gap-6">
			<AccountValue
				address={multisig.address}
				name={accountName(multisig)}
				value={assets.value}
				pricesAvailable={assets.pricesAvailable}
				pricesError={assets.pricesError}
				isLoading={assets.isLoading}
				isError={assets.isError}
				onSend={() =>
					openProposalSheet({ kind: 'transfer' })
				}
			/>
			<TokensCard
				address={multisig.address}
				assets={assets}
				onSend={(coinType) =>
					openProposalSheet({ kind: 'transfer', coinType })
				}
			/>
			<OpenProposals multisig={multisig} />
		</div>
	);
}
