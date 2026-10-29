// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft, Pen } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import {
	analyzerIssueCount,
	IntentSummary,
} from '@/components/preview-effects/IntentSummary';
import { ExpiryChip } from '@/components/proposals/ProposalExpiry';
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
import { type useDryRun } from '@/hooks/useDryRun';
import { useExpiry } from '@/hooks/useExpiry';
import { type useTransactionAnalysis } from '@/hooks/useTransactionAnalysis';
import { COPY, titleError } from '@/lib/new-proposal';
import { type NamedAccount } from '@/lib/transaction-preview';
import { cn, safeDecode } from '@/lib/utils';

/** Step 3: the title, the simulated effects and the raw bytes, then propose. */
export function ReviewStep({
	bytes,
	sender,
	title,
	onTitleChange,
	dryRun,
	analysis,
	creating,
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
	const failureReason = safeDecode(
		dryRun.error?.message ||
			'the transaction would fail on-chain',
	);
	const currentTitleError = titleError(title);
	const expiry = useExpiry(bytes);
	const analyzer = (
		<IntentSummary
			analysis={analysis.data}
			isLoading={analysis.isPending}
			error={analysis.error}
		/>
	);
	const analyzerCount = analyzerIssueCount(
		analysis.data,
		analysis.error,
	);

	return (
		<div
			className="flex flex-col gap-4.5 p-5 md:p-7"
			data-testid="review-step"
		>
			<SectionHeading
				title="Review and propose"
				description="Check the proposal before you sign and send it to the other signers."
			/>

			<TitleCard
				title={title}
				error={currentTitleError}
				disabled={creating}
				onTitleChange={onTitleChange}
			/>

			{expiry && (
				<div className="flex" data-testid="review-expiry">
					<ExpiryChip expiry={expiry} />
				</div>
			)}

			{simulationFailed && (
				<Notice
					tone="error"
					testId="review-simulation-error"
				>
					{COPY.simulationFailed(failureReason)}
				</Notice>
			)}

			{!simulation ? (
				<RetryNotice
					onRetry={onRetrySimulation}
					testId="review-simulation-unreachable"
					retryTestId="review-simulation-retry"
				>
					{COPY.simulationUnreachable}
				</RetryNotice>
			) : (
				// One wrapper for pending and settled, so the preview keeps
				// its tab when the simulation lands.
				<div
					data-testid={
						settled
							? 'transaction-preview-result'
							: undefined
					}
					data-result={
						settled
							? simulationPassed
								? 'success'
								: 'failure'
							: undefined
					}
				>
					<TransactionPreview
						bytes={bytes}
						accounts={accounts}
						analyzer={analyzer}
						analyzerCount={analyzerCount}
						{...simulation}
					/>
				</div>
			)}

			<Separator />

			{createError && (
				<Notice tone="error" testId="review-create-error">
					{createError}
				</Notice>
			)}

			<StepFooter
				onCancel={onCancel}
				cancelDisabled={creating}
				testId="new-proposal"
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
						Back
					</Button>
				}
				primary={
					<Button
						type="button"
						onClick={onSubmit}
						disabled={
							!settled || creating || !!currentTitleError
						}
						className={cn(
							disabledButton,
							'w-full sm:w-auto',
						)}
						data-testid="review-submit"
					>
						{creating ? (
							'Creating proposal…'
						) : createError ? (
							'Try again'
						) : (
							<>
								<Pen />
								{simulationFailed
									? 'Propose and sign anyway'
									: 'Propose and sign'}
							</>
						)}
					</Button>
				}
			/>
		</div>
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
				Title
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
					aria-label="Title"
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
						{title.trim() || 'No title'}
					</span>
					<Tooltip>
						<TooltipTrigger
							aria-label="Edit title"
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
						<TooltipContent>Edit title</TooltipContent>
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
