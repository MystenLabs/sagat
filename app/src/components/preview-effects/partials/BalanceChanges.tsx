// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';

import { PreviewCard } from '../PreviewCard';
import { onChainAmountToFloat, prettifyType } from '../utils';
import type { SuiClientTypes } from '@mysten/sui/client';

export function BalanceChanges({
	changes,
}: {
	changes: SuiClientTypes.BalanceChange[];
}) {
	return (
		<div className="grid grid-cols-2 gap-4">
			{changes.map((change, index) => (
				<ChangedBalance key={index} change={change} />
			))}
		</div>
	);
}

function ChangedBalance({
	change,
}: {
	change: SuiClientTypes.BalanceChange;
}) {
	// TODO: This should use the "active" client of the selection, NOT
	// the dappKit client! 
	// Otehrwise, this does a query to the wrong network.
	const client = useDAppKit().getClient();

	const { data: coinMetadata } = useQuery({
		queryKey: ['getCoinMetadata', change.coinType],
		queryFn: async () => {
			return await client.getCoinMetadata({
				coinType: change.coinType!,
			});
		},
		select: (data) => data.coinMetadata,
		enabled: !!change.coinType,
	});

	const amount = () => {
		if (!coinMetadata) return '-';
		const amt = onChainAmountToFloat(
			change.amount!,
			coinMetadata.decimals,
		);

		return `${amt && amt > 0.0 ? '+' : ''}${amt}`;
	};

	if (!coinMetadata) return <div>Loading...</div>;

	return (
		<PreviewCard.Root>
			<PreviewCard.Body>
				<>
					{coinMetadata.iconUrl && (
						<img
							src={coinMetadata.iconUrl as string}
							alt={coinMetadata.name}
							className="w-12 h-auto"
						/>
					)}
					<p>
						<span
							className={`${Number(amount()) > 0.0 ? 'text-green-700' : 'text-red-700'}`}
						>
							{amount()}{' '}
						</span>{' '}
						{coinMetadata.symbol}
						<span className="block text-sm text-gray-600">
							{change.coinType ? prettifyType(change.coinType) : null}
						</span>
					</p>
				</>
			</PreviewCard.Body>
			<PreviewCard.Footer owner={change.address} />
		</PreviewCard.Root>
	);
}
