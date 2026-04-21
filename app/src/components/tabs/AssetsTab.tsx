// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';

import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { useNetwork } from '../../contexts/NetworkContext';
import { useCoinMetadataMap } from '../../hooks/useCoinMetadata';
import { useMultisigBalances } from '../../hooks/useMultisigBalances';
import { CONFIG } from '../../lib/constants';
import { AssetsHeader } from '../assets/AssetsHeader';
import { AssetsList } from '../assets/AssetsList';
import { type ProposalIntent } from '../ProposalSheet';
import { Button } from '../ui/button';

interface AssetsTabContext {
	multisig: MultisigWithMembersForPublicKey;
	openProposalSheet: (intent?: ProposalIntent) => void;
}

export function AssetsTab() {
	const { multisig, openProposalSheet } =
		useOutletContext<AssetsTabContext>();
	const { network } = useNetwork();
	const [isRefreshCooldown, setIsRefreshCooldown] =
		useState(false);

	const balancesQuery = useMultisigBalances(
		multisig.address,
	);

	const coinTypes = useMemo(
		() => balancesQuery.balances.map((b) => b.coinType),
		[balancesQuery.balances],
	);
	const { map: metadataMap } =
		useCoinMetadataMap(coinTypes);

	const handleRefresh = () => {
		if (isRefreshCooldown || balancesQuery.isFetching) {
			return;
		}
		setIsRefreshCooldown(true);
		balancesQuery.refetch();
		setTimeout(() => setIsRefreshCooldown(false), 5000);
	};

	const explorerUrl = `${CONFIG.EXPLORER_URLS[network]}/account/${multisig.address}`;

	return (
		<div className="space-y-4">
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
				metadataMap={metadataMap}
				explorerUrl={explorerUrl}
				renderRowActions={(balance, metadata) => (
					<Button
						variant="outline"
						size="sm"
						className="h-7 px-2.5 text-xs"
						disabled={metadata?.decimals == null}
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
