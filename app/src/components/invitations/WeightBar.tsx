// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { sumWeight, thresholdLabel } from '@/lib/threshold';
import { cn } from '@/lib/utils';
import {
	MARKER_WIDTH_PX,
	runMarkerLeft,
	SEGMENT_GAP_PX,
	thresholdMarkerLeft,
	weightBarLayout,
	type WeightedSigner,
	type WeightTone,
} from '@/lib/weight-bar';

/** Accepted weight is solid, yours is grey while you decide, the rest light. */
const TONE_CLASS: Record<WeightTone, string> = {
	you: 'bg-foreground/40',
	accepted: 'bg-foreground',
	pending: 'bg-secondary',
};

/**
 * Where the account stands against its threshold and where you fit: a
 * legend over a bar drawn like the create wizard's threshold bar, one
 * segment per unit of weight, accepted first and yours next, with a
 * marker at the threshold.
 */
export function WeightBar({
	signers,
	threshold,
	yourWeight,
}: {
	signers: WeightedSigner[];
	threshold: number;
	/** Null when you are not among the signers. */
	yourWeight: number | null;
}) {
	const totalWeight = sumWeight(signers);
	const accepted = sumWeight(
		signers.filter((signer) => signer.tone === 'accepted'),
	);
	const bar = weightBarLayout(signers, threshold);

	return (
		<div
			className="flex flex-col gap-2"
			data-testid="invitation-weight-bar"
		>
			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-12">
				<div className="flex flex-wrap gap-x-4 gap-y-1">
					<Legend
						label="Your weight"
						value={
							yourWeight === null ? '—' : String(yourWeight)
						}
						testId="weight-legend-you"
					>
						<Swatch tone="you" />
					</Legend>
					<Legend
						label="Accepted"
						value={String(accepted)}
						testId="weight-legend-accepted"
					>
						<Swatch tone="accepted" />
					</Legend>
				</div>
				<Legend
					label="Threshold"
					value={thresholdLabel({ threshold, totalWeight })}
					testId="weight-legend-threshold"
				>
					<span className="h-3 w-0.5 bg-foreground" />
				</Legend>
			</div>
			{bar.kind === 'segments' ? (
				// The legend already says what the bar shows.
				<div
					aria-hidden
					className="relative flex h-1.5"
					style={{ gap: SEGMENT_GAP_PX }}
				>
					{bar.tones.map((tone, i) => (
						<span
							key={i}
							className={cn(
								'flex-1 rounded-xs',
								TONE_CLASS[tone],
							)}
							data-tone={tone}
							data-weight={1}
						/>
					))}
					{bar.tones.length > 0 && (
						<Marker
							left={thresholdMarkerLeft(
								threshold,
								bar.tones.length,
							)}
						/>
					)}
				</div>
			) : (
				<div aria-hidden className="relative flex h-1.5">
					{bar.runs.map((run, i) => (
						<span
							key={i}
							className={cn(
								'min-w-1 basis-0',
								TONE_CLASS[run.tone],
								i === 0 && 'rounded-l-xs',
								i === bar.runs.length - 1 && 'rounded-r-xs',
							)}
							style={{ flexGrow: run.weight }}
							data-tone={run.tone}
							data-weight={run.weight}
						/>
					))}
					{/* Runs have no gaps, so the marker needs an edge of its own. */}
					<Marker
						left={runMarkerLeft(bar.thresholdPercent)}
						className="outline-2 outline-card"
					/>
				</div>
			)}
		</div>
	);
}

function Legend({
	label,
	value,
	testId,
	children,
}: {
	label: string;
	value: string;
	testId: string;
	children: ReactNode;
}) {
	return (
		<span
			className="flex items-center gap-1.5"
			data-testid={testId}
		>
			{children}
			<span className="text-muted-foreground">
				{label}
			</span>{' '}
			<span className="font-medium">{value}</span>
		</span>
	);
}

function Swatch({ tone }: { tone: WeightTone }) {
	return (
		<span
			className={cn(
				'h-1.5 w-2.5 rounded-xs',
				TONE_CLASS[tone],
			)}
		/>
	);
}

function Marker({
	left,
	className,
}: {
	left: string;
	className?: string;
}) {
	return (
		<span
			className={cn(
				'absolute -top-1 h-3.5 bg-foreground',
				className,
			)}
			style={{ left, width: MARKER_WIDTH_PX }}
		/>
	);
}
