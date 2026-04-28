// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { zodResolver } from '@hookform/resolvers/zod';
import { useDAppKit } from '@mysten/dapp-kit-react';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { useMutation } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import {
	useCallback,
	useEffect,
	useRef,
} from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod/v3';

import { useCoinDisplayData } from '../../hooks/useCoinDisplayData';
import { type Balance } from '../../hooks/useMultisigBalances';
import {
	formatCoinAmount,
	getMaxInputAmount,
	isSuiCoinType,
	parseAmount,
} from '../../lib/coins';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { AssetPicker } from './AssetPicker';
import { buildTransferTransaction } from './buildTransferTransaction';

export interface PreparedTransfer {
	transactionData: string;
}

interface TransferFormProps {
	multisigAddress: string;
	balances: Balance[];
	isLoadingBalances: boolean;
	initialCoinType?: string | null;
	isPreviewing: boolean;
	onPrepare: (prepared: PreparedTransfer) => void;
	onReset: () => void;
}

interface TransferFormValues {
	coinType: string;
	recipient: string;
	amount: string;
}

const transferSchema = z.object({
	coinType: z.string().min(1, 'Pick an asset to send.'),
	recipient: z
		.string()
		.trim()
		.min(1, 'Please enter a recipient address.')
		.refine(isValidSuiAddress, 'Please enter a valid Sui address.'),
	amount: z.string().trim().min(1, 'Please enter an amount.'),
});

export function TransferForm({
	multisigAddress,
	balances,
	isLoadingBalances,
	initialCoinType,
	isPreviewing,
	onPrepare,
	onReset,
}: TransferFormProps) {
	const client = useDAppKit().getClient();

	const form = useForm<TransferFormValues>({
		resolver: zodResolver(transferSchema),
		mode: 'onSubmit',
		reValidateMode: 'onSubmit',
		defaultValues: {
			coinType: initialCoinType ?? '',
			recipient: '',
			amount: '',
		},
	});
	const { handleSubmit, control } = form;

	const coinType = useWatch({ control, name: 'coinType' });

	useEffect(() => {
		if (initialCoinType && initialCoinType !== coinType) {
			form.setValue('coinType', initialCoinType, {
				shouldDirty: true,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialCoinType]);

	useEffect(() => {
		if (
			coinType &&
			!balances.some((b) => b.coinType === coinType)
		) {
			form.setValue(
				'coinType',
				balances[0]?.coinType ?? '',
			);
		}
	}, [balances, coinType, form]);

	const selectedBalance =
		balances.find((b) => b.coinType === coinType) ?? null;
	const { data: selectedCoinData } =
		useCoinDisplayData(coinType);
	const decimals = selectedCoinData?.decimals ?? null;
	const symbol = selectedCoinData?.symbol ?? null;
	const formattedBalance =
		selectedBalance && decimals != null
			? formatCoinAmount(selectedBalance.balance, decimals)
			: null;
	const maxInputAmount =
		selectedBalance && decimals != null
			? getMaxInputAmount(selectedBalance.balance, decimals)
			: null;

	const buildMutation = useMutation({
		mutationFn: async ({
			coinType,
			recipient,
			amount,
			transferAllSui,
		}: {
			coinType: string;
			recipient: string;
			amount: bigint;
			transferAllSui: boolean;
		}) => {
			const transactionData =
				await buildTransferTransaction({
					sender: multisigAddress,
					recipient,
					coinType,
					amount,
					transferAllSui,
					client,
				});

			return { transactionData };
		},
		onSuccess: (prepared) => onPrepare(prepared),
	});

	const invalidatePreparedRef = useRef<() => void>(
		() => {},
	);
	useEffect(() => {
		invalidatePreparedRef.current = () => {
			// Clear stale amount errors when coin/amount-related inputs change.
			form.clearErrors('amount');

			if (buildMutation.isSuccess) {
				buildMutation.reset();
				onReset();
				return;
			}

			if (buildMutation.isError) {
				buildMutation.reset();
			}
		};
	});
	const onFieldChange = useCallback(() => {
		invalidatePreparedRef.current();
	}, []);

	const isBusy = buildMutation.isPending || isPreviewing;
	const handleMax = () => {
		if (!maxInputAmount) return;
		form.setValue('amount', maxInputAmount, {
			shouldDirty: true,
			shouldValidate: false,
		});
		invalidatePreparedRef.current();
	};

	const submitTransfer = (
		event: React.MouseEvent<HTMLButtonElement>,
	) =>
		handleSubmit((values) => {
			const balance = balances.find(
				(b) => b.coinType === values.coinType,
			);
			const valueDecimals = selectedCoinData?.decimals ?? null;
			if (!balance || valueDecimals == null) {
				form.setError('amount', {
					type: 'manual',
					message:
						"Coin metadata isn't loaded yet. Please try again in a moment.",
				});
				return;
			}

			const parsed = parseAmount(values.amount, valueDecimals);
			if (parsed == null) {
				form.setError('amount', {
					type: 'manual',
					message: `Enter a valid positive amount (up to ${valueDecimals} decimals).`,
				});
				return;
			}
			if (parsed === 0n) {
				form.setError('amount', {
					type: 'manual',
					message: 'Amount must be greater than zero.',
				});
				return;
			}

			const rawBalance = BigInt(balance.balance);
			const isSui = isSuiCoinType(values.coinType);
			const transferAllSui = isSui && parsed === rawBalance;
			if (!transferAllSui && parsed > rawBalance) {
				const formatted = formatCoinAmount(
					rawBalance.toString(),
					valueDecimals,
				);
				const balanceLabel = `${formatted}${
					symbol ? ` ${symbol}` : ''
				}`;
				form.setError('amount', {
					type: 'manual',
					message: `Amount exceeds available balance (${balanceLabel}).`,
				});
				return;
			}

			form.clearErrors('amount');
			buildMutation.mutate({
				coinType: balance.coinType,
				recipient: values.recipient.trim(),
				amount: parsed,
				transferAllSui,
			});
		})(event);

	const errors = form.formState.errors;
	const buildError = buildMutation.error;

	return (
		<div className="space-y-5">
			<div className="space-y-1.5">
				<label className="text-sm font-medium">Asset</label>
				<AssetPicker
					balances={balances}
					selectedCoinType={coinType || null}
					onSelect={(next) => {
						form.setValue('coinType', next, {
							shouldDirty: true,
						});
						onFieldChange();
					}}
					disabled={isBusy}
					isLoading={isLoadingBalances}
				/>
				{errors.coinType && (
					<p className="text-sm text-error-foreground">
						{errors.coinType.message}
					</p>
				)}
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
					disabled={isBusy}
					autoComplete="off"
					spellCheck={false}
					{...form.register('recipient', {
						onChange: onFieldChange,
					})}
				/>
				{errors.recipient && (
					<p className="text-sm text-error-foreground">
						{errors.recipient.message}
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
						disabled={isBusy || !maxInputAmount}
					>
						Max
					</Button>
				</div>
				<div className="relative">
					<Input
						id="transfer-amount"
						placeholder="0.0"
						disabled={isBusy}
						inputMode="decimal"
						autoComplete="off"
						spellCheck={false}
						className={symbol ? 'pr-14' : undefined}
						{...form.register('amount', {
							onChange: onFieldChange,
						})}
					/>
					{symbol && (
						<span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs uppercase tracking-wide text-muted-foreground">
							{symbol}
						</span>
					)}
				</div>
				{errors.amount && (
					<p className="text-sm text-error-foreground">
						{errors.amount.message}
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
					{buildError instanceof Error
						? buildError.message
						: 'Failed to build the transfer transaction.'}
				</p>
			)}

			<div className="flex justify-end">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={isBusy}
					onClick={submitTransfer}
				>
					<Eye className="w-4 h-4 mr-1" />
					{buildMutation.isPending
						? 'Preparing…'
						: isPreviewing
							? 'Previewing…'
							: 'Preview Effects'}
				</Button>
			</div>
		</div>
	);
}
