// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { zodResolver } from '@hookform/resolvers/zod';
import { useDAppKit } from '@mysten/dapp-kit-react';
import {
	isValidSuiAddress,
	SUI_TYPE_ARG,
} from '@mysten/sui/utils';
import { useMutation } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod/v3';

import { type CoinMetadata } from '../../hooks/useCoinMetadata';
import { type Balance } from '../../hooks/useMultisigBalances';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { AssetPicker } from './AssetPicker';
import { buildTransferTransaction } from './buildTransferTransaction';
import {
	formatBalance,
	getMaxInputAmount,
	parseAmount,
} from './formatBalance';

export interface PreparedTransfer {
	transactionData: string;
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

interface TransferFormValues {
	coinType: string;
	recipient: string;
	amount: string;
}

// Keep a small SUI buffer so "Max" transfers do not consume the full gas coin.
const SUI_TRANSFER_GAS_RESERVE = 50_000_000n; // 0.05 SUI

/**
 * Build a Zod schema bound to the currently-selected coin's decimals
 * and on-chain balance. We rebuild it whenever those change so the
 * resolver always validates against fresh runtime values.
 */
function buildSchema(
	balances: Balance[],
	metadataMap: Map<string, CoinMetadata | null | undefined>,
) {
	return z
		.object({
			coinType: z.string().min(1, 'Pick an asset to send.'),
			recipient: z
				.string()
				.trim()
				.min(1, 'Please enter a recipient address.')
				.refine(
					isValidSuiAddress,
					'Please enter a valid Sui address.',
				),
			amount: z.string(),
		})
		.superRefine((values, ctx) => {
			const balance = balances.find(
				(b) => b.coinType === values.coinType,
			);
			const decimals =
				metadataMap.get(values.coinType)?.decimals ?? null;

			if (!balance || decimals == null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['amount'],
					message:
						"Coin metadata isn't loaded yet. Please try again in a moment.",
				});
				return;
			}

			const parsed = parseAmount(values.amount, decimals);
			if (parsed == null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['amount'],
					message: `Enter a valid positive amount (up to ${decimals} decimals).`,
				});
				return;
			}
			if (parsed === 0n) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['amount'],
					message: 'Amount must be greater than zero.',
				});
				return;
			}
			const rawBalance = BigInt(balance.balance);
			const maxSpendable =
				values.coinType === SUI_TYPE_ARG
					? rawBalance > SUI_TRANSFER_GAS_RESERVE
						? rawBalance - SUI_TRANSFER_GAS_RESERVE
						: 0n
					: rawBalance;
			if (
				values.coinType === SUI_TYPE_ARG &&
				maxSpendable === 0n
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['amount'],
					message:
						'SUI balance is too low to cover transfer gas.',
				});
				return;
			}
			if (parsed > maxSpendable) {
				const symbol =
					metadataMap.get(values.coinType)?.symbol ?? '';
				const formatted = formatBalance(
					maxSpendable.toString(),
					decimals,
				);
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['amount'],
					message:
						values.coinType === SUI_TYPE_ARG
							? `Leave some SUI for gas. Maximum transferable amount is ${formatted}${
									symbol ? ` ${symbol}` : ''
								}.`
							: `Amount exceeds available balance (${formatted}${
									symbol ? ` ${symbol}` : ''
								}).`,
				});
			}
		});
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

	const schema = useMemo(
		() => buildSchema(balances, metadataMap),
		[balances, metadataMap],
	);

	const form = useForm<TransferFormValues>({
		resolver: zodResolver(schema),
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

	// Apply prop-driven coin selection updates without making the
	// component own that state outside RHF.
	useEffect(() => {
		if (initialCoinType && initialCoinType !== coinType) {
			form.setValue('coinType', initialCoinType, {
				shouldDirty: true,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialCoinType]);

	// If the selected coin disappears (zero balance, multisig switched,
	// etc.), fall back to whatever's first in the list.
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
	const selectedMetadata = coinType
		? metadataMap.get(coinType)
		: null;
	const decimals = selectedMetadata?.decimals ?? null;
	const symbol = selectedMetadata?.symbol ?? null;
	const formattedBalance =
		selectedBalance && decimals != null
			? formatBalance(selectedBalance.balance, decimals)
			: null;
	const maxInputAmount =
		selectedBalance && decimals != null
			? getMaxInputAmount(
					selectedBalance.balance,
					decimals,
					coinType === SUI_TYPE_ARG
						? SUI_TRANSFER_GAS_RESERVE.toString()
						: undefined,
				)
			: null;

	const buildMutation = useMutation({
		mutationFn: async (values: TransferFormValues) => {
			const balance = balances.find(
				(b) => b.coinType === values.coinType,
			)!;
			const meta = metadataMap.get(values.coinType)!;
			const amount = parseAmount(
				values.amount,
				meta.decimals,
			)!;

			const transactionData =
				await buildTransferTransaction({
					sender: multisigAddress,
					recipient: values.recipient.trim(),
					coinType: balance.coinType,
					amount,
					client,
				});

			return { transactionData };
		},
		onSuccess: (prepared) => onPrepare(prepared),
	});

	// Any user edit after a successful prepare invalidates the parent's
	// dry-run / proposal-creation state. Bind to RHF's per-field
	// `onChange` so we fire exactly once per keystroke without a watch
	// subscription effect.
	const invalidatePreparedRef = useRef<() => void>(
		() => {},
	);
	useEffect(() => {
		invalidatePreparedRef.current = () => {
			if (!buildMutation.isSuccess) return;
			buildMutation.reset();
			onReset();
		};
	});
	const onFieldChange = useCallback(() => {
		invalidatePreparedRef.current();
	}, []);

	const isBusy = buildMutation.isPending || isPreviewing;
	const handleMax = () => {
		if (!maxInputAmount) return;
		form.setValue(
			'amount',
			maxInputAmount,
			{ shouldDirty: true, shouldValidate: false },
		);
		onFieldChange();
	};

	// Nested <form>s are not valid HTML — `ProposalSheet` already renders
	// a parent <form>, so we expose the submit handler imperatively from
	// a button click instead. Wrap in an event handler so RHF's
	// ref-touching `handleSubmit(...)` only runs at click time, not on
	// every render.
	const submitTransfer = (
		event: React.MouseEvent<HTMLButtonElement>,
	) =>
		handleSubmit((values) => {
			buildMutation.mutate(values);
		})(event);

	const errors = form.formState.errors;
	const buildError = buildMutation.error;

	return (
		<div className="space-y-5">
			<div className="space-y-1.5">
				<label className="text-sm font-medium">Asset</label>
				<AssetPicker
					balances={balances}
					metadataMap={metadataMap}
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
						disabled={
							isBusy || !maxInputAmount
						}
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
