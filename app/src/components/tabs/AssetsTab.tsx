// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Send } from 'lucide-react';
import {
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useOutletContext } from 'react-router-dom';

import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { useNetwork } from '../../contexts/NetworkContext';
import { useCoinDisplayDataMap } from '../../hooks/useCoinDisplayData';
import { useMultisigBalances } from '../../hooks/useMultisigBalances';
import {
	coinUsdValue,
	sortBalances,
} from '../../lib/coins';
import { CONFIG } from '../../lib/constants';
import { AssetsHeader } from '../assets/AssetsHeader';
import { AssetsList } from '../assets/AssetsList';
import { type ProposalIntent } from '../ProposalSheet';
import { Button } from '../ui/button';

interface AssetsTabContext {
	multisig: MultisigWithMembersForPublicKey;
	openProposalSheet: (intent?: ProposalIntent) => void;
}

const REFRESH_COOLDOWN_MS = 5_000;

export function AssetsTab() {
	const { multisig, openProposalSheet } =
		useOutletContext<AssetsTabContext>();
	const { network } = useNetwork();
	const [isRefreshCooldown, setIsRefreshCooldown] =
		useState(false);
	const cooldownTimerRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);

	const balancesQuery = useMultisigBalances(
		multisig.address,
	);

	const coinTypes = useMemo(
		() => balancesQuery.balances.map((b) => b.coinType),
		[balancesQuery.balances],
	);
	const { map: coinDataMap } =
		useCoinDisplayDataMap(coinTypes);

	const sortedBalances = useMemo(
		() =>
			sortBalances(balancesQuery.balances, (balance) =>
				coinUsdValue(balance.balance, {
					priceUsd: coinDataMap.get(balance.coinType)
						?.priceUsd,
					decimals: coinDataMap.get(balance.coinType)
						?.decimals,
				}),
			),
		[balancesQuery.balances, coinDataMap],
	);

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

	const explorerUrl = `${CONFIG.EXPLORER_URLS[network]}/account/${multisig.address}`;

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
						onClick={() =>
							openProposalSheet({
								kind: 'transfer',
								coinType: balance.coinType,
							})
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
