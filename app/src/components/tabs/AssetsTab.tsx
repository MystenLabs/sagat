// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
	useNavigate,
	useOutletContext,
} from 'react-router-dom';

import { newProposalPath } from '@/lib/new-proposal';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { useNetwork } from '../../contexts/NetworkContext';
import { useAccountAssets } from '../../hooks/useAccountAssets';
import { getExplorerUrl } from '../../lib/utils';
import { AssetsHeader } from '../assets/AssetsHeader';
import { AssetsList } from '../assets/AssetsList';
import { Button } from '../ui/button';

interface AssetsTabContext {
	multisig: MultisigWithMembersForPublicKey;
}

const REFRESH_COOLDOWN_MS = 5_000;

export function AssetsTab() {
	const { multisig } = useOutletContext<AssetsTabContext>();
	const navigate = useNavigate();
	const { network } = useNetwork();
	const [isRefreshCooldown, setIsRefreshCooldown] =
		useState(false);
	const cooldownTimerRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);

	const { query: balancesQuery, balances: sortedBalances } =
		useAccountAssets(multisig.address);

	useEffect(() => {
		return () => {
			if (cooldownTimerRef.current != null) {
				clearTimeout(cooldownTimerRef.current);
			}
		};
	}, []);

	const handleRefresh = () => {
		if (isRefreshCooldown || balancesQuery.isFetching) {
			return;
		}
		setIsRefreshCooldown(true);
		balancesQuery.refetch();
		cooldownTimerRef.current = setTimeout(() => {
			setIsRefreshCooldown(false);
			cooldownTimerRef.current = null;
		}, REFRESH_COOLDOWN_MS);
	};

	const explorerUrl = getExplorerUrl(
		multisig.address,
		network,
		'account',
	);

	return (
		<div className="space-y-4 px-3">
			<AssetsHeader
				count={balancesQuery.balances.length}
				hasMore={balancesQuery.hasNextPage ?? false}
				isRefetching={balancesQuery.isFetching}
				isRefreshCooldown={isRefreshCooldown}
				onRefresh={handleRefresh}
				explorerUrl={explorerUrl}
			/>

			<AssetsList
				query={balancesQuery}
				balances={sortedBalances}
				multisigAddress={multisig.address}
				renderRowActions={(balance, coinData) => (
					<Button
						variant="outline"
						size="sm"
						className="h-7 px-2.5 text-xs"
						disabled={coinData?.decimals == null}
						data-testid="asset-send-button"
						onClick={() =>
							navigate(
								newProposalPath(multisig.address, {
									type: 'transfer',
									coinType: balance.coinType,
								}),
							)
						}
					>
						<Send className="w-3.5 h-3.5 mr-1" />
						Send
					</Button>
				)}
			/>
		</div>
	);
}
