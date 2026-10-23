// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ArrowLeft,
	ChevronDown,
	ChevronUp,
	Pen,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { EffectsPreview } from '@/components/preview-effects/EffectsPreview';
import { IntentSummary } from '@/components/preview-effects/IntentSummary';
import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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
import {
	networkLabel,
	useNetwork,
} from '@/contexts/NetworkContext';
import { type useDryRun } from '@/hooks/useDryRun';
import { type useTransactionAnalysis } from '@/hooks/useTransactionAnalysis';
import { COPY, titleError } from '@/lib/new-proposal';
import { cn, safeDecode } from '@/lib/utils';

/** Step 3: the title, the simulated effects and the raw bytes, then propose. */
export function ReviewStep({
	bytes,
	title,
	onTitleChange,
	dryRun,
	analysis,
	creating,
	createError,
	onSubmit,
	onBack,
	onCancel,
}: {
	bytes: string;
	title: string;
	onTitleChange: (title: string) => void;
	dryRun: ReturnType<typeof useDryRun>;
	analysis: ReturnType<typeof useTransactionAnalysis>;
	creating: boolean;
	/** Why the last attempt failed, or null. */
	createError: string | null;
	onSubmit: () => void;
	onBack: () => void;
	onCancel: () => void;
}) {
	const { network } = useNetwork();
	const [showRaw, setShowRaw] = useState(false);

	// Not started counts as simulating, so the first frame doesn't flash
	// an empty result.
	const settled = dryRun.isSuccess || dryRun.isError;
	const simulationPassed =
		dryRun.isSuccess &&
		!!dryRun.data?.Transaction?.effects.status.success;
	const simulationFailed = settled && !simulationPassed;
	const failureReason = safeDecode(
		dryRun.error?.message ||
			'the transaction would fail on-chain',
	);
	const currentTitleError = titleError(title);

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

			{simulationFailed && (
				<Notice
					tone="error"
					testId="review-simulation-error"
				>
					{COPY.simulationFailed(failureReason)}
				</Notice>
			)}

			{settled ? (
				<div
					data-testid="transaction-preview-result"
					data-result={
						simulationPassed ? 'success' : 'failure'
					}
				>
					{simulationPassed && dryRun.data ? (
						<EffectsPreview
							output={dryRun.data}
							bytes={bytes}
							analysis={analysis.data}
							isAnalysisLoading={analysis.isPending}
							analysisError={analysis.error}
						/>
					) : (
						<IntentSummary
							analysis={analysis.data}
							isLoading={analysis.isPending}
							error={analysis.error}
						/>
					)}
				</div>
			) : (
				<div
					className="flex flex-col gap-2"
					data-testid="review-simulating"
				>
					<p className="text-12 text-muted-foreground">
						Simulating on {networkLabel(network)}…
					</p>
					<SkeletonRows rows={3} header />
				</div>
			)}

			<div className="flex flex-col gap-2">
				<button
					type="button"
					onClick={() => setShowRaw((v) => !v)}
					aria-expanded={showRaw}
					aria-controls="review-raw-transaction"
					className="flex w-fit cursor-pointer items-center gap-1 rounded-sm text-12 text-foreground-secondary outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
					data-testid="review-raw-toggle"
				>
					{showRaw
						? 'Hide raw transaction'
						: 'Show raw transaction'}
					{showRaw ? (
						<ChevronUp className="size-3" />
					) : (
						<ChevronDown className="size-3" />
					)}
				</button>
				{showRaw && (
					<Textarea
						id="review-raw-transaction"
						readOnly
						value={bytes}
						aria-label="Raw transaction bytes"
						className="h-30 resize-none font-mono break-all md:text-12"
						data-testid="review-raw-transaction"
					/>
				)}
			</div>

			<Divider />

			{createError && (
				<Notice tone="error" testId="review-create-error">
					{createError}
				</Notice>
			)}

			<StepFooter
				onCancel={onCancel}
				cancelDisabled={creating}
				cancelTestId="new-proposal-cancel-footer"
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
		<div className="flex flex-col gap-1 rounded-lg bg-muted p-4">
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
