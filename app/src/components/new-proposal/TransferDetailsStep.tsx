// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import {
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { buildTransferTransaction } from '@/components/assets/buildTransferTransaction';
import { AddressField } from '@/components/ui/address-field';
import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
	FooterNote,
	Notice,
	RetryNotice,
	SectionHeading,
	StepFooter,
} from '@/components/wizard/parts';
import { useTouched } from '@/components/wizard/use-touched';
import { content } from '@/content';
import { useAccountAssets } from '@/hooks/useAccountAssets';
import { useSuiGasCoins } from '@/hooks/useSuiGasCoins';
import { accountName } from '@/lib/account-name';
import { coinLabels } from '@/lib/coinDisplay';
import {
	coinUsdValue,
	formatCoinAmount,
	formatUsdValue,
	isSuiCoinType,
} from '@/lib/coins';
import {
	checkTransfer,
	lacksGas,
	maxTransfer,
	titleError,
	transferTitle,
	type ReadyProposal,
	type TransferDraft,
} from '@/lib/new-proposal';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

import { AssetSelect } from './AssetSelect';
import { TitleField } from './TitleField';

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
	onReady: (ready: ReadyProposal) => void;
	onBack: () => void;
	onCancel: () => void;
}) {
	const client = useDAppKit().getClient();
	// In the long form the balances carry: the page normalizes `?asset=`.
	const coinType = draft.coinType;
	// Every balance, but the details of every coin only once the list has
	// been opened; until then, the chosen coin's.
	const [listOpened, setListOpened] = useState(false);
	const shownCoinTypes = useMemo(
		() => (coinType ? [coinType] : []),
		[coinType],
	);
	const assets = useAccountAssets(multisig.address, {
		allPages: true,
		displayCount: listOpened ? Number.MAX_SAFE_INTEGER : 0,
		coinTypes: shownCoinTypes,
	});
	const balancesLoading = assets.query.isLoading;
	const balancesComplete =
		!!assets.query.data &&
		!assets.query.isError &&
		!assets.query.hasNextPage;

	const balance =
		assets.balances.find((b) => b.coinType === coinType) ??
		null;
	const coin = coinType
		? assets.coinData.get(coinType)
		: undefined;
	const decimals = coin?.decimals ?? null;
	// Without its details the coin's decimals are unknown, so its amount
	// can't be read.
	const coinDataFailed =
		!!balance &&
		decimals === null &&
		assets.isCoinDataErrorFor(coinType);
	const symbol = coinType
		? coinLabels(coinType, coin).symbol
		: null;
	// Gas is paid in SUI: an account without any can’t send anything.
	const noGas =
		balancesComplete && lacksGas(assets.balances);

	// Max on SUI is what one transfer can spend (`maxTransfer`), which
	// needs the account's coins: Max and Review wait for them.
	const sendsSui = isSuiCoinType(coinType);
	const gasCoins = useSuiGasCoins(multisig.address, {
		enabled: sendsSui,
	});
	const maxUnknown =
		sendsSui && (gasCoins.isPending || gasCoins.isError);
	const max =
		balance && decimals != null && !maxUnknown
			? maxTransfer({
					balance: balance.balance,
					addressBalance: balance.addressBalance ?? '0',
					gasCoins: sendsSui
						? (gasCoins.data ?? null)
						: null,
					decimals,
				})
			: null;

	const check = checkTransfer({
		draft,
		balance: balance?.balance ?? null,
		decimals,
		symbol,
		maxAmount: maxUnknown ? null : max?.rawAmount,
	});
	const shownTitle =
		title ??
		transferTitle({
			rawAmount: check.rawAmount,
			decimals,
			symbol,
			recipient: draft.recipient,
		}) ??
		'';
	const currentTitleError = titleError(shownTitle);

	const priceUsd = coin?.priceUsd ?? null;
	const usd =
		priceUsd != null && decimals != null
			? coinUsdValue((check.rawAmount ?? 0n).toString(), {
					priceUsd,
					decimals,
				})
			: null;

	// A field shows its error once it has been used (`useTouched`). The
	// asset counts as used once its list has closed, or once the amount
	// or the recipient has been used without one.
	const { touched, touch, change } = useTouched({
		asset: false,
		amount: draft.amount !== '',
		recipient: draft.recipient !== '',
		title: title !== null && title !== '',
	});

	const build = useMutation({
		mutationFn: (input: {
			coinType: string;
			recipient: string;
			amount: bigint;
			transferAllSui: boolean;
		}) =>
			buildTransferTransaction({
				sender: multisig.address,
				client,
				...input,
			}),
	});

	// The fields hold still while building; `latestDraft` also drops a
	// build whose draft changed meanwhile, so Review never gets bytes
	// for an older draft.
	const building = build.isPending;
	const latestDraft = useRef(draft);
	useEffect(() => {
		latestDraft.current = draft;
	}, [draft]);

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

	const assetTouched =
		touched.asset || touched.amount || touched.recipient;
	const assetError =
		assetTouched && !balancesLoading
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
		!noGas &&
		!currentTitleError &&
		!building;

	const submit = () => {
		if (!canReview || check.rawAmount === null) return;
		const finalTitle = shownTitle.trim();
		const built = draft;
		build.mutate(
			{
				coinType,
				recipient: normalizeSuiAddress(
					draft.recipient.trim(),
				),
				amount: check.rawAmount,
				transferAllSui: check.transferAllSui,
			},
			{
				onSuccess: (bytes) => {
					if (latestDraft.current !== built) return;
					onReady({ bytes, title: finalTitle });
				},
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
				title={content.newProposal.types.transfer.title}
				description={content.newProposal.transferStep.description(
					accountName(multisig),
				)}
			/>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="transfer-asset">
					{content.newProposal.transferStep.assetLabel}
				</Label>
				<AssetSelect
					id="transfer-asset"
					balances={assets.balances}
					coinData={assets.coinData}
					value={coinType}
					onValueChange={(coinType) => {
						change('asset', draft.coinType);
						changeDraft({ ...draft, coinType });
					}}
					onOpen={() => setListOpened(true)}
					onClose={() => touch('asset')}
					isLoading={balancesLoading}
					disabled={building}
					invalid={!!assetError}
					describedBy={
						assetError ? 'transfer-asset-error' : undefined
					}
				/>
				{coinDataFailed && (
					<Notice
						tone="error"
						testId="transfer-coin-data-error"
					>
						{content.newProposal.coinDataFailed}
					</Notice>
				)}
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
				<Label htmlFor="transfer-amount">
					{content.newProposal.transferStep.amountLabel}
				</Label>
				<InputGroup>
					<InputGroupInput
						id="transfer-amount"
						value={draft.amount}
						onChange={(e) => {
							change('amount', draft.amount);
							changeDraft({
								...draft,
								amount: e.target.value,
							});
						}}
						onBlur={() => touch('amount')}
						disabled={building}
						placeholder={
							content.newProposal.transferStep
								.amountPlaceholder
						}
						inputMode="decimal"
						autoComplete="off"
						spellCheck={false}
						aria-invalid={!!amountError}
						aria-describedby="transfer-amount-hint"
						data-testid="transfer-amount-input"
					/>
					{coinType && (
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
									changeDraft({
										...draft,
										amount: max.amount,
									});
								}}
								disabled={max === null || building}
								className="cursor-pointer font-medium"
								data-testid="transfer-max-button"
							>
								{content.newProposal.transferStep.max}
							</InputGroupButton>
						</InputGroupAddon>
					)}
				</InputGroup>
				<div id="transfer-amount-hint" className="text-12">
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
					) : null}
				</div>
				{sendsSui && gasCoins.isError && (
					<RetryNotice
						onRetry={() => void gasCoins.refetch()}
						retrying={gasCoins.isFetching}
						noticeTestId="transfer-gas-coins-error"
						retryTestId="transfer-gas-coins-retry"
					>
						{content.newProposal.gasCoinsFailed}
					</RetryNotice>
				)}
				{sendsSui && max?.partial && decimals != null && (
					<Notice
						tone="warning"
						testId="transfer-max-partial"
					>
						{content.newProposal.maxPartial(
							formatCoinAmount(
								max.rawAmount.toString(),
								decimals,
							),
							symbol ?? 'SUI',
						)}
					</Notice>
				)}
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="transfer-recipient">
					{content.newProposal.transferStep.recipientLabel}
				</Label>
				<AddressField
					id="transfer-recipient"
					value={draft.recipient}
					onChange={(recipient) => {
						change('recipient', draft.recipient);
						changeDraft({ ...draft, recipient });
					}}
					onBlur={() => touch('recipient')}
					disabled={building}
					placeholder={
						content.newProposal.addressPlaceholder
					}
					valid={check.recipientValid}
					error={recipientError}
				/>
			</div>

			<TitleField
				value={shownTitle}
				// Once edited, the field no longer fills itself in.
				placeholder={
					title === null
						? content.newProposal.titlePlaceholderTransfer
						: content.newProposal.titlePlaceholder
				}
				hint={
					shownTitle.trim()
						? content.newProposal.titleHintTransfer
						: content.newProposal.titleHintEmpty
				}
				error={shownTitleError}
				onChange={(next) => {
					change('title', shownTitle);
					changeTitle(next);
				}}
				onBlur={() => touch('title')}
				disabled={building}
			/>

			{noGas && (
				<Notice tone="warning" testId="transfer-no-gas">
					{content.newProposal.noGas}
				</Notice>
			)}

			{build.isError && (
				<Notice tone="error" testId="transfer-error">
					{content.newProposal.buildFailed(
						build.error.message,
					)}
				</Notice>
			)}

			<Separator />

			<StepFooter
				onCancel={onCancel}
				testId="new-proposal"
				back={
					<Button
						type="button"
						variant="ghost"
						onClick={onBack}
						className={disabledButton}
						data-testid="details-back"
					>
						<ArrowLeft />
						{content.common.back}
					</Button>
				}
				note={
					<FooterNote>
						{content.newProposal.transferNote}
					</FooterNote>
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
						{building
							? content.newProposal.transferStep.building
							: content.newProposal.transferStep.review}
					</Button>
				}
			/>
		</form>
	);
}
