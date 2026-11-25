// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';

import { SignerRow } from '@/components/create-multisig/SignerRow';
import {
	AddSignerButton,
	SignerList,
	ThresholdSection,
} from '@/components/create-multisig/SignersStep';
import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Separator } from '@/components/ui/separator';
import {
	Notice,
	SectionHeading,
	StepFooter,
} from '@/components/wizard/parts';
import { content } from '@/content';
import {
	isReplaced,
	rowChip,
	rowName,
	type ChangeCheck,
	type ChangeRow,
	type CurrentSet,
	type RowChip,
} from '@/lib/change-signers';
import { CONFIG } from '@/lib/constants';
import { validatePublicKey } from '@/lib/sui-utils';
import { sumWeight } from '@/lib/threshold';
import { cn } from '@/lib/utils';

const COPY = content.changeSigners;
const CREATE = content.createMultisig;

/** Step 1: the signers and the threshold, edited from the current set. */
export function ChangesStep({
	current,
	rows,
	check,
	threshold,
	focusId,
	network,
	onRowsChange,
	onAddSigner,
	onThresholdChange,
	onReview,
	onCancel,
}: {
	current: CurrentSet;
	rows: ChangeRow[];
	check: ChangeCheck;
	threshold: number;
	focusId: string | null;
	network: string;
	onRowsChange: (rows: ChangeRow[]) => void;
	onAddSigner: () => void;
	onThresholdChange: (threshold: number) => void;
	onReview: () => void;
	onCancel: () => void;
}) {
	const kept = rows.filter((row) => !row.removed);
	const atMax = kept.length >= CONFIG.MAX_MEMBERS;
	const { totalWeight } = check.signers;
	const currentTotal = sumWeight(current.members);
	const update = (
		id: string,
		changes: Partial<ChangeRow>,
	) =>
		onRowsChange(
			rows.map((row) => {
				if (row.id !== id) return row;
				const next = { ...row, ...changes };
				// A key put back is the member again, name included.
				return next.was && !isReplaced(next)
					? { ...next, label: next.was.label ?? '' }
					: next;
			}),
		);
	let keptIndex = 0;

	return (
		<div
			className="flex flex-col gap-7 p-5 md:p-7"
			data-testid="change-signers-step"
		>
			<section className="flex flex-col gap-3.5">
				<div className="flex items-start justify-between gap-4">
					<SectionHeading
						title={content.signers.title}
						description={COPY.description}
					/>
					<span className="shrink-0 text-12 text-muted-foreground">
						{CREATE.signersStep.count(
							kept.length,
							CONFIG.MAX_MEMBERS,
						)}
					</span>
				</div>

				<SignerList signers={rows} onChange={onRowsChange}>
					{rows.map((row, index) => (
						<SignerRow
							key={row.id}
							signer={row}
							check={
								row.removed
									? BLANK
									: check.signers.signers[keptIndex++]
							}
							index={index}
							autoFocus={row.id === focusId && !row.was}
							focusKey={row.id === focusId && !!row.was}
							nameReadOnly={!!row.was && !isReplaced(row)}
							removed={row.removed}
							onUndo={
								atMax
									? undefined
									: () => update(row.id, { removed: false })
							}
							chip={<ChangeChip kind={rowChip(row)} />}
							note={rowNote(row, network)}
							onChange={(changes) =>
								update(row.id, changes)
							}
							onRemove={() =>
								row.was
									? update(row.id, { removed: true })
									: onRowsChange(
											rows.filter((r) => r.id !== row.id),
										)
							}
						/>
					))}
				</SignerList>

				<div className="flex">
					<AddSignerButton
						atMax={atMax}
						onClick={onAddSigner}
						testId="change-add-signer"
					/>
				</div>
			</section>

			<Separator />

			<ThresholdSection
				threshold={threshold}
				totalWeight={totalWeight}
				// Not the total: a threshold above it is the error state.
				max={CONFIG.MAX_WEIGHT * CONFIG.MAX_MEMBERS}
				onChange={onThresholdChange}
				testId="change"
				currently={
					(threshold !== current.threshold ||
						totalWeight !== currentTotal) && (
						<span className="text-12 text-muted-foreground">
							{COPY.currently(
								content.common.thresholdLabel(
									current.threshold,
									currentTotal,
								),
							)}
						</span>
					)
				}
				error={!!check.error}
				notice={
					check.signers.tooFewSigners ? (
						<Notice tone="warning" className="mt-2">
							{CREATE.tooFewSigners}
						</Notice>
					) : check.error ? (
						<Notice
							tone="error"
							className="mt-2"
							testId="change-threshold-error"
						>
							{check.error}
						</Notice>
					) : (
						check.warning && (
							<Notice
								tone="warning"
								className="mt-2"
								testId="change-threshold-warning"
							>
								{check.warning}
							</Notice>
						)
					)
				}
			/>

			<Separator />

			<StepFooter
				testId="change-signers"
				onCancel={onCancel}
				cancelLabel={content.common.actions.discard}
				note={check.signers.blockedMessage}
				primary={
					<Button
						type="button"
						disabled={!check.canReview}
						onClick={onReview}
						className={cn(
							disabledButton,
							'w-full sm:w-auto',
						)}
						data-testid="change-review"
					>
						{COPY.reviewChanges}
					</Button>
				}
			/>
		</div>
	);
}

const BLANK = {
	status: { kind: 'blank' as const },
	labelLength: 0,
	labelTooLong: false,
	labelInvalid: false,
	complete: false,
};

export function ChangeChip({
	kind,
}: {
	kind: RowChip | null | undefined;
}) {
	return (
		kind && (
			<Chip variant={kind === 'removed' ? 'error' : 'info'}>
				{COPY.chips[kind]}
			</Chip>
		)
	);
}

function rowNote(row: ChangeRow, network: string) {
	const { was } = row;
	if (row.removed)
		return COPY.row.removed(rowName(row), network);
	if (!was) return COPY.row.invited;
	const weight =
		row.weight !== was.weight ? (
			<span className="text-info-foreground">
				{COPY.row.weightChange(was.weight, row.weight)}
			</span>
		) : null;
	if (!isReplaced(row)) return weight;
	const old = validatePublicKey(was.publicKey).address;
	return (
		<>
			<span className="text-muted-foreground">
				{COPY.row.was}{' '}
				<span className="font-mono text-11">
					{old && formatAddress(old)}
				</span>
			</span>
			<span
				aria-hidden
				className="text-muted-foreground/70"
			>
				·
			</span>
			{weight ?? (
				<span className="text-muted-foreground">
					{COPY.row.weightStays(was.weight)}
				</span>
			)}
		</>
	);
}
