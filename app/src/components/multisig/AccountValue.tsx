// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowDownToLine, Send } from 'lucide-react';
import { useState } from 'react';

import {
	formatUsdValue,
	shownUsdTotal,
	type PortfolioValue,
} from '@/lib/coins';

import { ReceiveDialog } from '../shell/ReceiveDialog';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';

/**
 * What the account holds, in USD, with Receive and Send beside it. Only
 * coins with a known price count; the line under the amount says when
 * some were left out, and the amount is withheld when none has a price,
 * prices are unavailable (off mainnet), the price service failed or the
 * balances failed to load.
 */
export function AccountValue({
	address,
	name,
	value,
	pricesAvailable,
	pricesError,
	isLoading,
	isError,
	onSend,
}: {
	address: string;
	name: string;
	value: PortfolioValue;
	pricesAvailable: boolean;
	pricesError: boolean;
	isLoading: boolean;
	isError: boolean;
	onSend: () => void;
}) {
	const [receiveOpen, setReceiveOpen] = useState(false);
	const settled = !isLoading && !isError;
	// Every coin is unpriced without the price service; an account with
	// no coins is still worth $0.00.
	const pricesFailed =
		settled && pricesError && value.unpriced > 0;
	const total =
		settled && !pricesFailed
			? shownUsdTotal(value, pricesAvailable)
			: null;

	return (
		<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
			<div
				className="flex min-w-0 flex-col gap-1"
				data-testid="account-value"
				data-usd={total ?? undefined}
				data-unpriced={
					settled && !pricesFailed
						? value.unpriced
						: undefined
				}
				data-prices-error={pricesFailed ? '1' : undefined}
			>
				<span className="text-13 text-muted-foreground">
					Total value
				</span>
				{isLoading ? (
					<Skeleton className="my-1 h-9 w-48 @3xl:h-10" />
				) : (
					<span
						className="text-32 font-bold tabular-nums @3xl:text-40"
						data-testid="account-value-amount"
					>
						{total != null ? formatUsdValue(total) : '—'}
					</span>
				)}
				{settled && value.unpriced > 0 && (
					<span className="text-12 text-muted-foreground">
						{pricesFailed
							? 'Prices are unavailable right now.'
							: total != null
								? `Excludes ${value.unpriced} ${value.unpriced === 1 ? 'token' : 'tokens'} without a price.`
								: 'No prices for the tokens this account holds.'}
					</span>
				)}
			</div>
			<div className="flex gap-2">
				<Button
					onClick={() => setReceiveOpen(true)}
					data-testid="overview-receive-button"
				>
					<ArrowDownToLine />
					Receive
				</Button>
				<Button
					onClick={onSend}
					data-testid="overview-send-button"
				>
					<Send />
					Send
				</Button>
			</div>
			<ReceiveDialog
				open={receiveOpen}
				onClose={() => setReceiveOpen(false)}
				address={address}
				name={name}
			/>
		</div>
	);
}
