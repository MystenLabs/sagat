// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { thresholdLabel } from '@/lib/threshold';
import { cn } from '@/lib/utils';
import {
	thresholdMarkerLeft,
	weightBar,
	type WeightedSigner,
	type WeightTone,
} from '@/lib/weight-bar';

// Accepted weight is solid, yours is grey while you decide, the rest light.
const TONE_CLASS: Record<WeightTone, string> = {
	you: 'bg-foreground/40',
	accepted: 'bg-foreground',
	pending: 'bg-secondary',
};

/**
 * Where the account stands against its threshold and where you fit: a
 * legend over a bar drawn like the create wizard's threshold bar, one
 * segment per unit of weight in signer order, with a marker at the
 * threshold.
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
	const totalWeight = sum(signers);
	const accepted = sum(
		signers.filter((signer) => signer.tone === 'accepted'),
	);
	const bar = weightBar(signers, threshold);

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
					className="relative flex h-1.5 gap-1"
				>
					{bar.tones.map((tone, i) => (
						<span
							key={i}
							className={cn(
								'flex-1 rounded-xs',
								TONE_CLASS[tone],
							)}
							data-tone={tone}
						/>
					))}
					<Marker
						left={thresholdMarkerLeft(
							threshold,
							bar.tones.length,
						)}
					/>
				</div>
			) : (
				<div aria-hidden className="relative flex h-1.5">
					{bar.runs.map((run, i) => (
						<span
							key={i}
							className={cn(
								'min-w-0 basis-0',
								TONE_CLASS[run.tone],
								i === 0 && 'rounded-l-xs',
								i === bar.runs.length - 1 && 'rounded-r-xs',
							)}
							style={{ flexGrow: run.weight }}
							data-tone={run.tone}
							data-weight={run.weight}
						/>
					))}
					<Marker left={`calc(${bar.percent}% - 1px)`} />
				</div>
			)}
		</div>
	);
}

function sum(signers: WeightedSigner[]) {
	return signers.reduce(
		(total, signer) => total + signer.weight,
		0,
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
	children: React.ReactNode;
}) {
	return (
		<span
			className="flex items-center gap-1.5"
			data-testid={testId}
			data-value={value}
		>
			{children}
			<span className="text-muted-foreground">{label}</span>
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

function Marker({ left }: { left: string }) {
	return (
		<span
			className="absolute -top-1 h-3.5 w-0.5 bg-foreground"
			style={{ left }}
		/>
	);
}
