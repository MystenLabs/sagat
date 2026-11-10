// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import {
	SegmentBar,
	ToneSwatch,
} from '@/components/multisig/SegmentBar';
import { content } from '@/content';
import { sumWeight, thresholdLabel } from '@/lib/threshold';
import { cn } from '@/lib/utils';
import {
	MARKER_WIDTH_PX,
	runMarkerLeft,
	thresholdMarkerLeft,
	weightBarLayout,
	type WeightPart,
} from '@/lib/weight-bar';

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
	signers: WeightPart[];
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
						label={content.common.fields.yourWeight}
						value={
							yourWeight === null ? '—' : String(yourWeight)
						}
						testId="weight-legend-you"
					>
						<ToneSwatch tone="you" />
					</Legend>
					<Legend
						label={content.invitations.weightBar.accepted}
						value={String(accepted)}
						testId="weight-legend-accepted"
					>
						<ToneSwatch tone="accepted" />
					</Legend>
				</div>
				<Legend
					label={content.common.fields.threshold}
					value={thresholdLabel({ threshold, totalWeight })}
					testId="weight-legend-threshold"
				>
					<span className="h-3 w-0.5 bg-foreground" />
				</Legend>
			</div>
			{/* The legend already says what the bar shows. */}
			<SegmentBar layout={bar}>
				{bar.kind === 'segments' ? (
					bar.tones.length > 0 && (
						<Marker
							left={thresholdMarkerLeft(
								threshold,
								bar.tones.length,
							)}
						/>
					)
				) : (
					// Runs have no gaps, so the marker needs an edge of its own.
					<Marker
						left={runMarkerLeft(bar.thresholdPercent)}
						className="outline-2 outline-card"
					/>
				)}
			</SegmentBar>
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
			data-testid="weight-threshold-marker"
		/>
	);
}
