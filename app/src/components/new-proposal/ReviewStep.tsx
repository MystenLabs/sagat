// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft, Pen } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { analyzerTab } from '@/components/preview-effects/IntentSummary';
import { ReviewExpiry } from '@/components/proposals/ProposalExpiry';
import { AliasCallsWarning } from '@/components/transaction-preview/AliasCallsWarning';
import { simulationProps } from '@/components/transaction-preview/simulation';
import { TransactionPreview } from '@/components/transaction-preview/TransactionPreview';
import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import {
	Notice,
	RetryNotice,
	SectionHeading,
	StepFooter,
} from '@/components/wizard/parts';
import { content } from '@/content';
import { useNetwork } from '@/contexts/NetworkContext';
import { type useDryRun } from '@/hooks/useDryRun';
import { type useTransactionAnalysis } from '@/hooks/useTransactionAnalysis';
import { titleError } from '@/lib/new-proposal';
import { type NamedAccount } from '@/lib/transaction-preview';
import { cn, safeDecode } from '@/lib/utils';

const COPY = content.newProposal;

/** Step 3: the title, the simulated effects and the raw bytes, then propose. */
export function ReviewStep({
	bytes,
	sender,
	title,
	onTitleChange,
	dryRun,
	analysis,
	creating,
	awaitingWallet,
	createError,
	onRetrySimulation,
	onSubmit,
	onBack,
	onCancel,
}: {
	bytes: string;
	/** The account the proposal is for, named in the preview. */
	sender: NamedAccount;
	title: string;
	onTitleChange: (title: string) => void;
	dryRun: ReturnType<typeof useDryRun>;
	analysis: ReturnType<typeof useTransactionAnalysis>;
	creating: boolean;
	/** Part of `creating`: the wallet is still signing. */
	awaitingWallet: boolean;
	/** Why the last attempt failed, or null. */
	createError: string | null;
	/** Runs the simulation again after it couldn't run. */
	onRetrySimulation: () => void;
	onSubmit: () => void;
	onBack: () => void;
	onCancel: () => void;
}) {
	// Null when the simulation couldn't run (offline, say): no verdict to
	// show, and nothing to propose on until it runs. Not started counts
	// as simulating, so the first frame doesn't flash an empty result.
	const simulation = simulationProps(dryRun);
	const settled =
		!!simulation && simulation.status !== 'pending';
	const simulationPassed = simulation?.status === 'passed';
	const simulationFailed = settled && !simulationPassed;
	// The sender by value, since the page rebuilds it each render.
	const { address: senderAddress, name: senderName } =
		sender;
	const accounts = useMemo(
		() => [{ address: senderAddress, name: senderName }],
		[senderAddress, senderName],
	);
	const currentTitleError = titleError(title);
	const { network } = useNetwork();
	const { analyzer, analyzerCount } = analyzerTab(analysis);

	return (
		<div
			className="flex flex-col gap-4.5 p-5 md:p-7"
			data-testid="review-step"
		>
			<SectionHeading
				title={COPY.review.title}
				description={COPY.review.description}
			/>

			<TitleCard
				title={title}
				error={currentTitleError}
				disabled={creating}
				onTitleChange={onTitleChange}
			/>

			<ReviewExpiry bytes={bytes} />

			{simulationFailed && (
				<SimulationFailedNotice dryRun={dryRun} />
			)}

			<AliasCallsWarning bytes={bytes} network={network} />

			{!simulation ? (
				<SimulationRetry onRetry={onRetrySimulation} />
			) : (
				<TransactionPreview
					bytes={bytes}
					accounts={accounts}
					analyzer={analyzer}
					analyzerCount={analyzerCount}
					{...simulation}
				/>
			)}

			<ProposeFooter
				testId="new-proposal"
				createError={createError}
				creating={creating}
				awaitingWallet={awaitingWallet}
				simulationFailed={simulationFailed}
				disabled={!settled || !!currentTitleError}
				onSubmit={onSubmit}
				onBack={onBack}
				onCancel={onCancel}
			/>
		</div>
	);
}

export function SimulationFailedNotice({
	dryRun,
}: {
	dryRun: ReturnType<typeof useDryRun>;
}) {
	return (
		<Notice tone="error" testId="review-simulation-error">
			{COPY.simulationFailed(
				safeDecode(
					dryRun.error?.message ||
						COPY.simulationFailedFallback,
				),
			)}
		</Notice>
	);
}

/** When the simulation couldn't run at all. */
export function SimulationRetry({
	onRetry,
}: {
	onRetry: () => void;
}) {
	return (
		<RetryNotice
			onRetry={onRetry}
			testId="review-simulation-unreachable"
			retryTestId="review-simulation-retry"
		>
			{COPY.simulationUnreachable}
		</RetryNotice>
	);
}

/** The create error, then Back and Propose and sign. */
export function ProposeFooter({
	testId,
	createError,
	creating,
	awaitingWallet,
	simulationFailed,
	disabled,
	onSubmit,
	onBack,
	onCancel,
}: {
	testId: string;
	createError: string | null;
	creating: boolean;
	awaitingWallet: boolean;
	simulationFailed: boolean;
	/** Holds Propose besides creating. */
	disabled: boolean;
	onSubmit: () => void;
	onBack: () => void;
	onCancel: () => void;
}) {
	const submitLabel = () => {
		if (awaitingWallet)
			return content.common.states.confirmInWallet;
		if (creating) return COPY.review.creating;
		if (createError) return content.common.actions.tryAgain;
		return (
			<>
				<Pen />
				{simulationFailed
					? COPY.review.proposeAnyway
					: COPY.review.propose}
			</>
		);
	};
	return (
		<>
			<Separator />

			{createError && (
				<Notice tone="error" testId="review-create-error">
					{createError}
				</Notice>
			)}

			<StepFooter
				onCancel={onCancel}
				cancelDisabled={creating}
				cancelLabel={content.common.actions.discard}
				testId={testId}
				back={
					<Button
						type="button"
						variant="ghost"
						onClick={onBack}
						disabled={creating}
						className={disabledButton}
						data-testid="review-back"
					>
						<ArrowLeft />
						{content.common.actions.back}
					</Button>
				}
				primary={
					<Button
						type="button"
						onClick={onSubmit}
						disabled={disabled || creating}
						className={cn(
							disabledButton,
							'w-full sm:w-auto',
						)}
						data-testid="review-submit"
					>
						{submitLabel()}
					</Button>
				}
			/>
		</>
	);
}

/**
 * The title on a muted card, with a pen that turns it into a field.
 * Enter or leaving the field keeps the edit; Escape drops it.
 */
function TitleCard({
	title,
	error,
	disabled,
	onTitleChange,
}: {
	title: string;
	error: string | null;
	disabled: boolean;
	onTitleChange: (title: string) => void;
}) {
	const [editing, setEditing] = useState<string | null>(
		null,
	);
	// Escape closes the field, which blurs it; skip that blur's commit.
	const cancelled = useRef(false);

	const commit = () => {
		if (editing === null) return;
		if (cancelled.current) {
			cancelled.current = false;
			return;
		}
		onTitleChange(editing);
		setEditing(null);
	};

	return (
		<div className="flex flex-col gap-1 rounded-xl bg-muted p-4">
			<span className="text-12 text-muted-foreground">
				{COPY.titleLabel}
			</span>
			{editing !== null ? (
				<Input
					size="sm"
					value={editing}
					onChange={(e) => setEditing(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							commit();
						} else if (e.key === 'Escape') {
							e.preventDefault();
							cancelled.current = true;
							setEditing(null);
						}
					}}
					autoFocus
					aria-label={COPY.titleLabel}
					aria-invalid={!!titleError(editing)}
					data-testid="review-title-input"
				/>
			) : (
				<span className="flex min-w-0 items-center gap-1.5">
					<span
						className={cn(
							'min-w-0 truncate text-14 font-medium',
							!title.trim() && 'text-muted-foreground',
						)}
						data-testid="review-title"
					>
						{title.trim() || COPY.review.noTitle}
					</span>
					<Tooltip>
						<TooltipTrigger
							aria-label={COPY.review.editTitle}
							onClick={() => {
								cancelled.current = false;
								setEditing(title);
							}}
							disabled={disabled}
							className="flex shrink-0 cursor-pointer items-center rounded-sm p-0.5 text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-30"
							data-testid="review-edit-title"
						>
							<Pen className="size-3" />
						</TooltipTrigger>
						<TooltipContent>
							{COPY.review.editTitle}
						</TooltipContent>
					</Tooltip>
				</span>
			)}
			{error && editing === null && (
				<p className="text-12 text-error-foreground">
					{error}
				</p>
			)}
		</div>
	);
}
