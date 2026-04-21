// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { Eye } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { type CoinMetadata } from '../../hooks/useCoinMetadata';
import { type Balance } from '../../hooks/useMultisigBalances';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { AssetPicker } from './AssetPicker';
import { buildTransferTransaction } from './buildTransferTransaction';
import {
	formatBalance,
	parseAmount,
} from './formatBalance';

export interface PreparedTransfer {
	transactionData: string;
	description: string;
}

interface TransferFormProps {
	multisigAddress: string;
	balances: Balance[];
	metadataMap: Map<string, CoinMetadata | null | undefined>;
	isLoadingBalances: boolean;
	initialCoinType?: string | null;
	/** Whether the parent is currently running a preview (dry-run). */
	isPreviewing: boolean;
	/** Called once the user has filled out a valid transfer + clicked Preview. */
	onPrepare: (prepared: PreparedTransfer) => void;
	/**
	 * Called whenever an input changes after a previous prepare so the
	 * parent can reset any stale dry-run / proposal-creation state.
	 */
	onReset: () => void;
}

export function TransferForm({
	multisigAddress,
	balances,
	metadataMap,
	isLoadingBalances,
	initialCoinType,
	isPreviewing,
	onPrepare,
	onReset,
}: TransferFormProps) {
	const client = useDAppKit().getClient();

	const [coinType, setCoinType] = useState<string | null>(
		initialCoinType ?? null,
	);
	const [recipient, setRecipient] = useState('');
	const [amount, setAmount] = useState('');
	const [recipientError, setRecipientError] = useState<
		string | null
	>(null);
	const [amountError, setAmountError] = useState<
		string | null
	>(null);
	const [buildError, setBuildError] = useState<
		string | null
	>(null);
	const [isBuilding, setIsBuilding] = useState(false);
	const [hasPrepared, setHasPrepared] = useState(false);

	// If the parent updates the initial selection (e.g. user opens the
	// sheet from a different asset row), respect that.
	useEffect(() => {
		if (initialCoinType && initialCoinType !== coinType) {
			setCoinType(initialCoinType);
			markDirty();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialCoinType]);

	// If our currently-selected coin disappears from the balances list
	// (e.g. balance dropped to zero, or a different multisig is loaded),
	// fall back to the first available one.
	useEffect(() => {
		if (
			coinType &&
			!balances.some((b) => b.coinType === coinType)
		) {
			setCoinType(balances[0]?.coinType ?? null);
		}
	}, [balances, coinType]);

	const selectedBalance = useMemo(
		() =>
			coinType
				? (balances.find((b) => b.coinType === coinType) ??
					null)
				: null,
		[balances, coinType],
	);
	const selectedMetadata = coinType
		? metadataMap.get(coinType)
		: null;
	const decimals = selectedMetadata?.decimals ?? null;
	const symbol = selectedMetadata?.symbol ?? null;
	const formattedBalance =
		selectedBalance && decimals != null
			? formatBalance(selectedBalance.balance, decimals)
			: null;

	function markDirty() {
		if (hasPrepared) {
			setHasPrepared(false);
			onReset();
		}
		setBuildError(null);
	}

	const handleSelectCoin = (next: string) => {
		setCoinType(next);
		setAmount('');
		setAmountError(null);
		markDirty();
	};

	const handleMax = () => {
		if (!selectedBalance || decimals == null) return;
		setAmount(
			formatBalance(selectedBalance.balance, decimals),
		);
		setAmountError(null);
		markDirty();
	};

	const handlePreview = async () => {
		setRecipientError(null);
		setAmountError(null);
		setBuildError(null);

		if (!selectedBalance || decimals == null) {
			setBuildError(
				"Coin metadata isn't loaded yet. Please try again in a moment.",
			);
			return;
		}

		const trimmedRecipient = recipient.trim();
		if (!trimmedRecipient) {
			setRecipientError(
				'Please enter a recipient address.',
			);
			return;
		}
		if (!isValidSuiAddress(trimmedRecipient)) {
			setRecipientError(
				'Please enter a valid Sui address.',
			);
			return;
		}

		const parsed = parseAmount(amount, decimals);
		if (parsed == null) {
			setAmountError(
				`Enter a valid positive amount (up to ${decimals} decimals).`,
			);
			return;
		}
		if (parsed === 0n) {
			setAmountError('Amount must be greater than zero.');
			return;
		}

		let availableBalance: bigint;
		try {
			availableBalance = BigInt(selectedBalance.balance);
		} catch {
			availableBalance = 0n;
		}
		if (parsed > availableBalance) {
			setAmountError(
				`Amount exceeds available balance (${formattedBalance ?? '0'}${
					symbol ? ` ${symbol}` : ''
				}).`,
			);
			return;
		}

		setIsBuilding(true);
		try {
			const transactionData =
				await buildTransferTransaction({
					sender: multisigAddress,
					recipient: trimmedRecipient,
					coinType: selectedBalance.coinType,
					amount: parsed,
					client,
				});

			const description = `Transfer ${formatBalance(
				parsed.toString(),
				decimals,
			)}${
				symbol ? ` ${symbol}` : ''
			} to ${trimmedRecipient}`;

			setHasPrepared(true);
			onPrepare({ transactionData, description });
		} catch (err) {
			setBuildError(
				err instanceof Error
					? err.message
					: 'Failed to build the transfer transaction.',
			);
		} finally {
			setIsBuilding(false);
		}
	};

	const isBusy = isBuilding || isPreviewing;
	const canPreview =
		!!selectedBalance &&
		decimals != null &&
		recipient.trim().length > 0 &&
		amount.trim().length > 0 &&
		!isBusy;

	return (
		<div className="space-y-5">
			<div className="space-y-1.5">
				<label className="text-sm font-medium">Asset</label>
				<AssetPicker
					balances={balances}
					metadataMap={metadataMap}
					selectedCoinType={coinType}
					onSelect={handleSelectCoin}
					disabled={isBusy}
					isLoading={isLoadingBalances}
				/>
			</div>

			<div className="space-y-1.5">
				<label
					htmlFor="transfer-recipient"
					className="text-sm font-medium"
				>
					Recipient
				</label>
				<Input
					id="transfer-recipient"
					placeholder="0x..."
					value={recipient}
					onChange={(e) => {
						setRecipient(e.target.value);
						if (recipientError) setRecipientError(null);
						markDirty();
					}}
					disabled={isBusy}
					autoComplete="off"
					spellCheck={false}
				/>
				{recipientError && (
					<p className="text-sm text-error-foreground">
						{recipientError}
					</p>
				)}
			</div>

			<div className="space-y-1.5">
				<div className="flex items-center justify-between">
					<label
						htmlFor="transfer-amount"
						className="text-sm font-medium"
					>
						Amount
					</label>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-xs"
						onClick={handleMax}
						disabled={
							isBusy || !selectedBalance || decimals == null
						}
					>
						Max
					</Button>
				</div>
				<div className="relative">
					<Input
						id="transfer-amount"
						placeholder="0.0"
						value={amount}
						onChange={(e) => {
							setAmount(e.target.value);
							if (amountError) setAmountError(null);
							markDirty();
						}}
						disabled={isBusy}
						inputMode="decimal"
						autoComplete="off"
						spellCheck={false}
						className={symbol ? 'pr-14' : undefined}
					/>
					{symbol && (
						<span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs uppercase tracking-wide text-muted-foreground">
							{symbol}
						</span>
					)}
				</div>
				{amountError && (
					<p className="text-sm text-error-foreground">
						{amountError}
					</p>
				)}
				{selectedBalance && (
					<p className="text-xs text-muted-foreground">
						Available:{' '}
						<span className="tabular-nums text-foreground">
							{formattedBalance ?? '—'}
						</span>
						{symbol && (
							<span className="ml-1 uppercase tracking-wide">
								{symbol}
							</span>
						)}
					</p>
				)}
			</div>

			{buildError && (
				<p className="text-sm text-error-foreground">
					{buildError}
				</p>
			)}

			<div className="flex justify-end">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handlePreview}
					disabled={!canPreview}
				>
					<Eye className="w-4 h-4 mr-1" />
					{isBuilding
						? 'Preparing…'
						: isPreviewing
							? 'Previewing…'
							: 'Preview Effects'}
				</Button>
			</div>
		</div>
	);
}
