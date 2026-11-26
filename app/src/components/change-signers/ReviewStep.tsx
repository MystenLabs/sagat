// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ArrowRight,
	GripVertical,
	Info,
	Pen,
	Plus,
	Trash2,
	Users,
	type LucideIcon,
} from 'lucide-react';

import { ChangeChip } from '@/components/change-signers/ChangesStep';
import {
	AddressBox,
	ReviewSigners,
} from '@/components/create-multisig/ReviewStep';
import {
	ProposeFooter,
	SimulationFailedNotice,
	SimulationRetry,
} from '@/components/new-proposal/ReviewStep';
import { ReviewExpiry } from '@/components/proposals/ProposalExpiry';
import { simulationProps } from '@/components/transaction-preview/simulation';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import { SectionHeading } from '@/components/wizard/parts';
import { content } from '@/content';
import { type useDryRun } from '@/hooks/useDryRun';
import {
	isReplaced,
	newComposition,
	rowChip,
	thresholdSummary,
	type ChangeKind,
	type ChangeRow,
	type CurrentSet,
	type Difference,
	type RowChip,
} from '@/lib/change-signers';
import { validatePublicKey } from '@/lib/sui-utils';
import { sumWeight } from '@/lib/threshold';

const COPY = content.changeSigners;
const FIELDS = content.common.fields;
const CREATE = content.createMultisig;

const LIST_CHIPS: Partial<Record<ChangeKind, RowChip>> = {
	add: 'new',
	remove: 'removed',
	replace: 'replaced',
};

const ICONS: Record<ChangeKind, LucideIcon> = {
	add: Plus,
	remove: Trash2,
	replace: Pen,
	weight: Pen,
	threshold: Users,
	reorder: GripVertical,
};

/** Step 2: the differences, the signers after the change, then propose. */
export function ReviewStep({
	name,
	network,
	address,
	current,
	rows,
	list,
	threshold,
	bytes,
	dryRun,
	creating,
	awaitingWallet,
	error,
	onRetrySimulation,
	onSubmit,
	onBack,
	onCancel,
}: {
	name: string;
	network: string;
	address: string;
	current: CurrentSet;
	rows: ChangeRow[];
	list: Difference[];
	threshold: number;
	/** Null while the transaction builds. */
	bytes: string | null;
	dryRun: ReturnType<typeof useDryRun>;
	creating: boolean;
	awaitingWallet: boolean;
	error: string | null;
	onRetrySimulation: () => void;
	onSubmit: () => void;
	onBack: () => void;
	onCancel: () => void;
}) {
	const simulation = bytes ? simulationProps(dryRun) : null;
	const settled =
		!!simulation && simulation.status !== 'pending';
	const simulationFailed =
		settled && simulation.status !== 'passed';
	const kept = rows.filter((row) => !row.removed);
	const [total, newTotal] = [current.members, kept].map(
		sumWeight,
	);
	const strip = [
		[FIELDS.signers, current.members.length, kept.length],
		[FIELDS.totalWeight, total, newTotal],
		[
			FIELDS.threshold,
			content.common.thresholdLabel(
				current.threshold,
				total,
			),
			content.common.thresholdLabel(threshold, newTotal),
		],
	] as const;

	return (
		<div
			className="flex flex-col gap-4.5 p-5 md:p-7"
			data-testid="change-review-step"
		>
			<SectionHeading
				title={COPY.reviewChanges}
				description={COPY.review.description}
			/>

			<section className="flex flex-col gap-2.5">
				<h3 className="flex items-center gap-2 text-14 font-medium">
					{COPY.review.changes}
					<span className="text-12 font-normal text-muted-foreground">
						{list.length}
					</span>
				</h3>
				<ChangeList
					list={list}
					summary={thresholdSummary(
						current,
						newComposition(rows, threshold),
					)}
				/>
				<p className="flex items-start gap-1.5 text-12 text-muted-foreground">
					<Info className="mt-0.5 size-3 shrink-0" />
					{list.every((item) => item.kind === 'reorder')
						? COPY.review.carryOverReorder
						: COPY.review.carryOver}
				</p>
			</section>

			<dl className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg bg-muted p-4">
				<Stat
					label={CREATE.fields.name}
					className="mr-auto"
				>
					{name}
				</Stat>
				<Stat label={FIELDS.network}>{network}</Stat>
				{strip.map(([label, from, to]) => (
					<Stat key={label} label={label}>
						<FromTo from={from} to={to} />
					</Stat>
				))}
			</dl>

			<section className="flex flex-col gap-3">
				<div className="flex items-center justify-between">
					<h3 className="text-14 font-medium">
						{COPY.review.signersAfter}
					</h3>
					<Button
						type="button"
						variant="link"
						size="xs"
						onClick={onBack}
						disabled={creating}
						className="h-auto gap-1 px-0 text-12 font-normal text-foreground-secondary"
						data-testid="change-review-edit"
					>
						<Pen className="size-3" />
						{CREATE.reviewStep.edit}
					</Button>
				</div>
				<ReviewSigners
					rows={kept.map((row, i) => ({
						id: row.id,
						position: i + 1,
						name:
							(row.was && !isReplaced(row)
								? row.was.label
								: row.label.trim()) || null,
						isYou: !!row.isCreator,
						key: row.key.trim(),
						address: validatePublicKey(row.key.trim())
							.address,
						weight: (
							<FromTo
								from={row.was?.weight ?? row.weight}
								to={row.weight}
							/>
						),
						chip: <ChangeChip kind={rowChip(row)} />,
					}))}
				/>
			</section>

			<AddressBox
				label={COPY.review.address}
				address={address}
			/>

			{bytes && <ReviewExpiry bytes={bytes} />}
			{simulationFailed && (
				<SimulationFailedNotice dryRun={dryRun} />
			)}
			{bytes && !simulation && (
				<SimulationRetry onRetry={onRetrySimulation} />
			)}

			<ProposeFooter
				testId="change-signers"
				createError={error}
				creating={creating}
				awaitingWallet={awaitingWallet}
				simulationFailed={simulationFailed}
				disabled={!settled && !error}
				onSubmit={onSubmit}
				onBack={onBack}
				onCancel={onCancel}
			/>
		</div>
	);
}

/** The differences as a bordered list, with an add's Sui address under it when known, and `summary` as the last line; a line naming `you` (a key) is marked. */
export function ChangeList({
	list,
	summary,
	you,
}: {
	list: Difference[];
	summary?: string | null;
	you?: string | null;
}) {
	return (
		<ul className="rounded-lg border">
			{list.map((item) => {
				const Icon = ICONS[item.kind];
				return (
					<li
						key={item.text}
						className="flex items-center gap-3 border-b px-4 py-3.5 text-13 last:border-b-0"
						data-testid="change-item"
						data-kind={item.kind}
					>
						<Icon className="size-4 shrink-0" />
						<span className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span>
								{item.text}
								{you && item.publicKey === you && (
									<>
										{' '}
										<span className="text-muted-foreground">
											{content.signers.markers.you.parens}
										</span>
									</>
								)}
							</span>
							{item.address && (
								<span className="font-mono text-12 break-all text-muted-foreground">
									{item.address}
								</span>
							)}
						</span>
						<ChangeChip kind={LIST_CHIPS[item.kind]} />
					</li>
				);
			})}
			{summary && (
				<li
					className="flex items-center gap-3 px-4 py-3.5 text-13"
					data-testid="change-summary"
				>
					<Users className="size-4 shrink-0" />
					{summary}
				</li>
			)}
		</ul>
	);
}

/** "7", or "7 → 8" when it changes. */
function FromTo({
	from,
	to,
}: {
	from: string | number;
	to: string | number;
}) {
	return from === to ? (
		<>{to}</>
	) : (
		<span className="inline-flex items-center gap-1">
			<span className="font-normal text-muted-foreground">
				{from}
			</span>
			<ArrowRight className="size-3 text-muted-foreground/70" />
			{to}
		</span>
	);
}
