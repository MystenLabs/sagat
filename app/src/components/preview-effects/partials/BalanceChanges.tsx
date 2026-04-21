// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';

import { useCoinMetadata } from '../../../hooks/useCoinMetadata';
import { CoinIcon } from '../../ui/CoinIcon';
import { PreviewCard } from '../PreviewCard';
import {
	onChainAmountToFloat,
	prettifyType,
} from '../utils';

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
	const { data: coinMetadata } = useCoinMetadata(
		change.coinType,
	);

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
					<CoinIcon
						iconUrl={coinMetadata.iconUrl}
						symbol={coinMetadata.symbol}
						coinType={change.coinType}
						size="xl"
					/>
					<p>
						<span
							className={`${Number(amount()) > 0.0 ? 'text-success-foreground' : 'text-error-foreground'}`}
						>
							{amount()}{' '}
						</span>{' '}
						{coinMetadata.symbol}
						<span className="block text-sm text-muted-foreground">
							{change.coinType
								? prettifyType(change.coinType)
								: null}
						</span>
					</p>
				</>
			</PreviewCard.Body>
			<PreviewCard.Footer owner={change.address} />
		</PreviewCard.Root>
	);
}
