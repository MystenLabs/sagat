// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Check, Info, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { buildTransferTransaction } from '@/components/assets/buildTransferTransaction';
import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import {
	Divider,
	Notice,
	SectionHeading,
	StepFooter,
} from '@/components/wizard/parts';
import { useAccountAssets } from '@/hooks/useAccountAssets';
import { accountName } from '@/lib/account-name';
import { coinLabels } from '@/lib/coinDisplay';
import {
	coinUsdValue,
	formatUsdValue,
	isSuiCoinType,
} from '@/lib/coins';
import {
	checkTransfer,
	COPY,
	maxAmount,
	titleError,
	transferTitle,
	type TransferDraft,
} from '@/lib/new-proposal';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

import { AssetSelect } from './AssetSelect';

type Field = 'asset' | 'amount' | 'recipient' | 'title';

/** Step 2 for a transfer: the asset, amount, recipient and title. */
export function TransferDetailsStep({
	multisig,
	draft,
	onDraftChange,
	title,
	onTitleChange,
	onReady,
	onBack,
	onCancel,
}: {
	multisig: MultisigWithMembersForPublicKey;
	draft: TransferDraft;
	onDraftChange: (draft: TransferDraft) => void;
	/** Null shows the title generated from the transfer. */
	title: string | null;
	onTitleChange: (title: string) => void;
	onReady: (ready: {
		bytes: string;
		title: string;
	}) => void;
	onBack: () => void;
	onCancel: () => void;
}) {
	const client = useDAppKit().getClient();
	const assets = useAccountAssets(multisig.address, {
		allPages: true,
		displayCount: Number.MAX_SAFE_INTEGER,
	});
	const balancesLoading = assets.query.isLoading;
	const balancesComplete =
		!!assets.query.data &&
		!assets.query.isError &&
		!assets.query.hasNextPage;

	const balance =
		assets.balances.find(
			(b) => b.coinType === draft.coinType,
		) ?? null;
	const coin = draft.coinType
		? assets.coinData.get(draft.coinType)
		: undefined;
	const decimals = coin?.decimals ?? null;
	const symbol = draft.coinType
		? coinLabels(draft.coinType, coin).symbol
		: null;
	const isSui = isSuiCoinType(draft.coinType);

	const check = checkTransfer({
		draft,
		balance: balance?.balance ?? null,
		decimals,
		symbol: coin?.symbol ?? null,
	});
	const shownTitle =
		title ??
		transferTitle({
			rawAmount: check.rawAmount,
			decimals,
			symbol: coin?.symbol ?? null,
			recipient: draft.recipient,
		}) ??
		'';
	const currentTitleError = titleError(shownTitle);

	const max =
		balance && decimals != null
			? maxAmount({
					balance: balance.balance,
					decimals,
					coinType: draft.coinType,
				})
			: null;
	const priceUsd = coin?.priceUsd ?? null;
	const usd =
		priceUsd != null && decimals != null
			? coinUsdValue((check.rawAmount ?? 0n).toString(), {
					priceUsd,
					decimals,
				})
			: null;
	// The reserve note shows while the amount is SUI's Max.
	const gasKept =
		isSui && max !== null && draft.amount === max;

	// A field shows its error once it has been left or edited after the
	// first keystroke; a field that arrives filled (back from Review)
	// counts as used.
	const [touched, setTouched] = useState<
		Record<Field, boolean>
	>(() => ({
		asset: false,
		amount: draft.amount !== '',
		recipient: draft.recipient !== '',
		title: title !== null && title !== '',
	}));
	const touch = (field: Field) =>
		setTouched((t) =>
			t[field] ? t : { ...t, [field]: true },
		);

	const build = useMutation({
		mutationFn: (input: {
			coinType: string;
			recipient: string;
			amount: bigint;
		}) =>
			buildTransferTransaction({
				sender: multisig.address,
				client,
				...input,
			}),
	});

	const changeDraft = (next: TransferDraft) => {
		if (build.isError) build.reset();
		onDraftChange(next);
	};
	const changeTitle = (next: string) => {
		if (build.isError) build.reset();
		onTitleChange(next);
	};

	// A preselected asset the account doesn't hold is dropped once every
	// balance is in.
	useEffect(() => {
		if (
			balancesComplete &&
			draft.coinType &&
			!assets.balances.some(
				(b) => b.coinType === draft.coinType,
			)
		) {
			onDraftChange({ ...draft, coinType: '' });
		}
	}, [
		balancesComplete,
		assets.balances,
		draft,
		onDraftChange,
	]);

	const recipientRef = useRef<HTMLInputElement>(null);

	const assetError =
		touched.asset && !balancesLoading
			? check.assetError
			: null;
	const amountError = touched.amount
		? check.amountError
		: null;
	const recipientError = touched.recipient
		? check.recipientError
		: null;
	const shownTitleError = touched.title
		? currentTitleError
		: null;

	const canReview =
		check.canReview &&
		!currentTitleError &&
		!build.isPending;

	const submit = () => {
		if (!canReview || check.rawAmount === null) return;
		const finalTitle = shownTitle.trim();
		build.mutate(
			{
				coinType: draft.coinType,
				recipient: normalizeSuiAddress(
					draft.recipient.trim(),
				),
				amount: check.rawAmount,
			},
			{
				onSuccess: (bytes) =>
					onReady({ bytes, title: finalTitle }),
			},
		);
	};

	return (
		<form
			className="flex flex-col gap-5.5 p-5 md:p-8"
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
			noValidate
			data-testid="transfer-step"
		>
			<SectionHeading
				title="Transfer"
				description={`Send tokens from ${accountName(multisig)} to one address.`}
			/>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="transfer-asset">Asset</Label>
				<AssetSelect
					id="transfer-asset"
					balances={assets.balances}
					coinData={assets.coinData}
					value={draft.coinType}
					onValueChange={(coinType) => {
						touch('asset');
						changeDraft({ ...draft, coinType });
					}}
					onClose={() => touch('asset')}
					isLoading={balancesLoading}
					invalid={!!assetError}
					describedBy={
						assetError ? 'transfer-asset-error' : undefined
					}
				/>
				{assetError && (
					<p
						id="transfer-asset-error"
						className="text-12 text-error-foreground"
						data-testid="transfer-asset-error"
					>
						{assetError}
					</p>
				)}
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="transfer-amount">Amount</Label>
				<InputGroup>
					<InputGroupInput
						id="transfer-amount"
						value={draft.amount}
						onChange={(e) => {
							if (draft.amount !== '') touch('amount');
							changeDraft({
								...draft,
								amount: e.target.value,
							});
						}}
						onBlur={() => touch('amount')}
						placeholder="0.00"
						inputMode="decimal"
						autoComplete="off"
						spellCheck={false}
						aria-invalid={!!amountError}
						aria-describedby="transfer-amount-hint"
						data-testid="transfer-amount-input"
					/>
					{draft.coinType && (
						<InputGroupAddon
							align="inline-end"
							className="gap-1 pr-1.5"
						>
							<span className="text-13 font-normal text-muted-foreground">
								{symbol}
							</span>
							<InputGroupButton
								onClick={() => {
									if (max === null) return;
									touch('amount');
									changeDraft({ ...draft, amount: max });
								}}
								disabled={max === null}
								className="cursor-pointer font-medium"
								data-testid="transfer-max-button"
							>
								Max
							</InputGroupButton>
						</InputGroupAddon>
					)}
				</InputGroup>
				<div
					id="transfer-amount-hint"
					className="flex items-start justify-between gap-3 text-12"
				>
					{amountError ? (
						<p
							className="text-error-foreground"
							data-testid="transfer-amount-error"
						>
							{amountError}
						</p>
					) : usd !== null ? (
						<p
							className="text-muted-foreground tabular-nums"
							data-testid="transfer-amount-usd"
						>
							{formatUsdValue(usd)}
						</p>
					) : (
						<span />
					)}
					{gasKept && (
						<p
							className="shrink-0 text-right text-muted-foreground"
							data-testid="transfer-gas-note"
						>
							{COPY.gasKept}
						</p>
					)}
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="transfer-recipient">To</Label>
				<InputGroup>
					<InputGroupInput
						ref={recipientRef}
						id="transfer-recipient"
						value={draft.recipient}
						onChange={(e) => {
							if (draft.recipient !== '')
								touch('recipient');
							changeDraft({
								...draft,
								recipient: e.target.value,
							});
						}}
						onBlur={() => touch('recipient')}
						placeholder={COPY.addressPlaceholder}
						autoComplete="off"
						spellCheck={false}
						aria-invalid={!!recipientError}
						aria-describedby="transfer-recipient-status"
						className="font-mono md:text-12"
						data-testid="transfer-recipient-input"
					/>
					{draft.recipient !== '' && (
						<InputGroupAddon align="inline-end">
							<Tooltip>
								<TooltipTrigger
									render={
										<InputGroupButton
											size="icon-xs"
											aria-label="Clear address"
											onClick={() => {
												changeDraft({
													...draft,
													recipient: '',
												});
												recipientRef.current?.focus();
											}}
											className="cursor-pointer text-muted-foreground hover:text-foreground"
											data-testid="transfer-recipient-clear"
										/>
									}
								>
									<X className="size-3.5" />
								</TooltipTrigger>
								<TooltipContent>
									Clear address
								</TooltipContent>
							</Tooltip>
						</InputGroupAddon>
					)}
				</InputGroup>
				<RecipientStatus
					valid={check.recipientValid}
					error={recipientError}
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="proposal-title">Title</Label>
				<Input
					id="proposal-title"
					value={shownTitle}
					onChange={(e) => {
						touch('title');
						changeTitle(e.target.value);
					}}
					onBlur={() => touch('title')}
					// Once edited, the field no longer fills itself in.
					placeholder={
						title === null
							? COPY.titlePlaceholderTransfer
							: COPY.titlePlaceholder
					}
					autoComplete="off"
					aria-invalid={!!shownTitleError}
					aria-describedby="proposal-title-hint"
					data-testid="proposal-title-input"
				/>
				<p
					id="proposal-title-hint"
					className={cn(
						'text-12',
						shownTitleError
							? 'text-error-foreground'
							: 'text-muted-foreground',
					)}
					data-state={shownTitleError ? 'error' : undefined}
					data-testid="proposal-title-hint"
				>
					{shownTitleError ?? COPY.titleHintTransfer}
				</p>
			</div>

			{build.isError && (
				<Notice tone="error" testId="transfer-error">
					{COPY.buildFailed}
				</Notice>
			)}

			<Divider />

			<StepFooter
				onCancel={onCancel}
				cancelTestId="new-proposal-cancel-footer"
				back={
					<Button
						type="button"
						variant="ghost"
						onClick={onBack}
						className={disabledButton}
						data-testid="details-back"
					>
						<ArrowLeft />
						Back
					</Button>
				}
				note={
					<span className="inline-flex items-center gap-1.5">
						<Info className="size-3 shrink-0" />
						{COPY.transferNote}
					</span>
				}
				primary={
					<Button
						type="submit"
						disabled={!canReview}
						className={cn(
							disabledButton,
							'w-full sm:w-auto',
						)}
						data-testid="transfer-review"
					>
						{build.isPending ? 'Building…' : 'Review'}
					</Button>
				}
			/>
		</form>
	);
}

/** "Valid Sui address" in green, or why the address isn't one. */
function RecipientStatus({
	valid,
	error,
}: {
	valid: boolean;
	error: string | null;
}) {
	if (!valid && !error) {
		return <span id="transfer-recipient-status" hidden />;
	}
	return (
		<p
			id="transfer-recipient-status"
			className={cn(
				'flex items-start gap-1 text-12',
				valid
					? 'text-success-foreground'
					: 'text-error-foreground',
			)}
			data-state={valid ? 'valid' : 'invalid'}
			data-testid="transfer-recipient-status"
		>
			{valid && (
				<Check
					className="mt-0.5 size-3 shrink-0"
					strokeWidth={2.5}
				/>
			)}
			{valid ? COPY.validAddress : error}
		</p>
	);
}
