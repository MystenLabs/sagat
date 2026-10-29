// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useNavigate,
	useOutletContext,
} from 'react-router-dom';

import { useAccountAssets } from '@/hooks/useAccountAssets';
import { accountName } from '@/lib/account-name';
import { newProposalPath } from '@/lib/new-proposal';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { AccountValue } from '../multisig/AccountValue';
import { OpenProposals } from '../multisig/OpenProposals';
import {
	TOKENS_SHOWN,
	TokensCard,
} from '../multisig/TokensCard';

interface OverviewTabContext {
	multisig: MultisigWithMembersForPublicKey;
}

/**
 * The account at a glance: what it holds in USD with Receive and Send,
 * its largest holdings, then the proposals still open.
 */
export function OverviewTab() {
	const { multisig } =
		useOutletContext<OverviewTabContext>();
	const navigate = useNavigate();
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
					navigate(
						newProposalPath(multisig.address, {
							type: 'transfer',
						}),
					)
				}
			/>
			<TokensCard
				address={multisig.address}
				assets={assets}
				onSend={(coinType) =>
					navigate(
						newProposalPath(multisig.address, {
							type: 'transfer',
							coinType,
						}),
					)
				}
			/>
			<OpenProposals multisig={multisig} />
		</div>
	);
}
