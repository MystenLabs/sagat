// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	cardClass,
	CardHeading,
} from '@/components/ui/card';
import { content } from '@/content';
import { formatShortDateTime } from '@/lib/dates';
import {
	activityRows,
	type ActivityRow,
	type Labels,
} from '@/lib/proposal-page';
import { type ProposalStatusKey } from '@/lib/proposalUtils';
import { type ProposalCardInput } from '@/lib/types';
import { cn } from '@/lib/utils';

const DOT: Record<ActivityRow['tone'], string> = {
	past: 'bg-chip-foreground/40',
	latest: 'bg-foreground',
	error: 'bg-error-foreground',
};

/** What happened to the proposal, oldest first. */
export function ActivityCard({
	proposal,
	status,
	labels,
	currentAddress,
	confirmedAt,
}: {
	proposal: ProposalCardInput;
	status: ProposalStatusKey;
	labels: Labels;
	currentAddress: string | null;
	confirmedAt: number | null;
}) {
	const rows = activityRows({
		proposal,
		status,
		labels,
		currentAddress,
		confirmedAt,
	});
	return (
		<section
			className={cardClass}
			aria-labelledby="activity-heading"
			data-testid="activity-card"
		>
			<CardHeading
				id="activity-heading"
				title={content.proposal.activity.heading}
			/>
			<ol className="flex flex-col gap-2.5">
				{rows.map((row) => {
					const at = formatShortDateTime(row.at);
					return (
						<li
							key={row.key}
							className="flex items-baseline gap-2.5 text-13"
							data-testid="activity-row"
						>
							<span
								aria-hidden
								className={cn(
									'size-1.5 shrink-0 -translate-y-0.5 rounded-full',
									DOT[row.tone],
								)}
							/>
							<span className="min-w-0 flex-1 break-words">
								{row.text}
							</span>
							{at && (
								<time
									className="shrink-0 text-12 whitespace-nowrap text-muted-foreground"
									dateTime={new Date(row.at!).toISOString()}
								>
									{at}
								</time>
							)}
						</li>
					);
				})}
			</ol>
		</section>
	);
}
