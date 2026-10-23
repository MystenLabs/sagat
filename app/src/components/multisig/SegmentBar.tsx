// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import {
	SEGMENT_GAP_PX,
	type weightBarLayout,
	type WeightTone,
} from '@/lib/weight-bar';

/** Accepted weight is solid, yours is grey while you decide, the rest light. */
const TONE_CLASS: Record<WeightTone, string> = {
	you: 'bg-foreground/40',
	accepted: 'bg-foreground',
	pending: 'bg-secondary',
};

/**
 * The bar the create wizard's threshold and the invitation's weight
 * share: one segment per unit of weight, or gapless runs sized by
 * weight once there are too many units to draw. Children sit in the
 * bar's positioned box, so a marker can be laid over it.
 */
export function SegmentBar({
	layout,
	className,
	children,
}: {
	layout: ReturnType<typeof weightBarLayout>;
	className?: string;
	children?: ReactNode;
}) {
	return (
		<div
			aria-hidden
			className={cn('relative flex h-1.5', className)}
			style={
				layout.kind === 'segments'
					? { gap: SEGMENT_GAP_PX }
					: undefined
			}
		>
			{layout.kind === 'segments'
				? layout.tones.map((tone, i) => (
						<span
							key={i}
							className={cn(
								'flex-1 rounded-xs',
								TONE_CLASS[tone],
							)}
							data-tone={tone}
							data-weight={1}
						/>
					))
				: layout.runs.map((run, i) => (
						<span
							key={i}
							className={cn(
								'min-w-1 basis-0',
								TONE_CLASS[run.tone],
								i === 0 && 'rounded-l-xs',
								i === layout.runs.length - 1 &&
									'rounded-r-xs',
							)}
							style={{ flexGrow: run.weight }}
							data-tone={run.tone}
							data-weight={run.weight}
						/>
					))}
			{children}
		</div>
	);
}

/** A tone's colour as a small key, for a legend beside the bar. */
export function ToneSwatch({ tone }: { tone: WeightTone }) {
	return (
		<span
			className={cn(
				'h-1.5 w-2.5 rounded-xs',
				TONE_CLASS[tone],
			)}
		/>
	);
}
