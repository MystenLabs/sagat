// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { Chip, type ChipProps } from '@/components/ui/chip';
import { CopyButton } from '@/components/ui/CopyButton';
import { SkeletonLine } from '@/components/ui/skeleton';
import { content } from '@/content';
import type {
	SimulationStatus,
	TransactionPreviewModel,
} from '@/lib/transaction-preview';
import { safeDecode } from '@/lib/utils';

const FIELDS = content.common.fields;
const COPY = content.transactionPreview.details;
const STATUS = content.transactionPreview.status;

const STATUS_CHIPS: Record<
	SimulationStatus,
	{
		label: string;
		variant: NonNullable<ChipProps['variant']>;
	}
> = {
	passed: { label: STATUS.passed, variant: 'success' },
	failed: { label: STATUS.failed, variant: 'error' },
	pending: { label: STATUS.pending, variant: 'neutral' },
};

function Row({
	label,
	children,
	testId,
}: {
	label: string;
	children: ReactNode;
	testId?: string;
}) {
	return (
		<div
			className="flex items-center gap-3 border-b px-3.5 py-2 last:border-b-0"
			data-testid={testId}
		>
			<span className="w-30 shrink-0 text-13 text-muted-foreground">
				{label}
			</span>
			<div className="flex min-w-0 flex-1 items-center gap-1.5 text-13">
				{children}
			</div>
		</div>
	);
}

/** A value read from the dry run: a line while it runs, "—" without one. */
function SimulatedValue({
	value,
	pending,
}: {
	value: string | null;
	pending: boolean;
}) {
	if (value !== null) return <span>{value}</span>;
	if (pending) return <SkeletonLine className="w-20" />;
	return <span className="text-muted-foreground">—</span>;
}

/** Digest, status, sender, epoch and gas. */
export function DetailsTable({
	model,
}: {
	model: TransactionPreviewModel;
}) {
	const chip = STATUS_CHIPS[model.status];
	const pending = model.status === 'pending';
	const { sender } = model;

	return (
		<div className="rounded-lg border">
			<Row label={COPY.digest}>
				<span
					className="min-w-0 font-mono text-12 break-all"
					data-testid="transaction-preview-digest"
					data-digest={model.digest}
				>
					{model.digest}
				</span>
				<CopyButton
					value={model.digest}
					size="inline"
					successMessage={content.toasts.digestCopied}
				/>
			</Row>
			<Row label={FIELDS.status}>
				<span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
					<Chip
						size="md"
						variant={chip.variant}
						data-testid="transaction-preview-status"
						data-status={model.status}
					>
						{chip.label}
					</Chip>
					<span className="text-12 text-muted-foreground">
						{model.statusMeta}
					</span>
				</span>
			</Row>
			{model.status === 'failed' && model.error && (
				<Row label={COPY.error}>
					<span
						className="min-w-0 text-13 break-words whitespace-pre-wrap text-error-foreground"
						data-testid="transaction-preview-error"
					>
						{safeDecode(model.error)}
					</span>
				</Row>
			)}
			<Row
				label={FIELDS.sender}
				testId="transaction-preview-sender"
			>
				{!sender ? (
					<span className="text-muted-foreground">—</span>
				) : (
					// The name wraps, and the address drops under it when there is no room.
					<span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
						{sender.name && (
							<span className="min-w-0 text-13 break-words">
								{sender.name}
							</span>
						)}
						<span className="flex min-w-0 items-center gap-1.5">
							<span className="min-w-0 font-mono text-12 break-all text-muted-foreground">
								{sender.address}
							</span>
							<CopyButton
								value={sender.address}
								size="inline"
								successMessage={
									content.toasts.addressCopied
								}
							/>
						</span>
					</span>
				)}
			</Row>
			<Row label={COPY.epoch}>
				<SimulatedValue
					value={model.epoch}
					pending={pending}
				/>
			</Row>
			<Row label={FIELDS.gas}>
				<SimulatedValue
					value={model.gas}
					pending={pending}
				/>
			</Row>
		</div>
	);
}
