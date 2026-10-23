// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type Proposal } from '@mysten/sagat';

import { weightDots } from '@/lib/proposalUtils';
import { cn } from '@/lib/utils';

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../ui/tooltip';

/**
 * A proposal's signature weight against its threshold as a row of dots,
 * one per unit of weight, filled as signatures come in. The exact numbers
 * ("2 of 4") sit in a tooltip.
 */
export function ProposalWeight({
	proposal,
	className,
}: {
	proposal: Pick<Proposal, 'currentWeight' | 'totalWeight'>;
	className?: string;
}) {
	const { dots, filled } = weightDots(proposal);
	const label = `${proposal.currentWeight} of ${proposal.totalWeight}`;
	return (
		<TooltipProvider delay={150}>
			<Tooltip>
				<TooltipTrigger
					type="button"
					aria-label={`Weight ${label}`}
					className={cn(
						'flex w-10 cursor-help gap-0.75 rounded-sm py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring',
						className,
					)}
					data-testid="proposal-weight"
					data-current-weight={proposal.currentWeight}
					data-total-weight={proposal.totalWeight}
				>
					{Array.from({ length: dots }, (_, i) => (
						<span
							key={i}
							aria-hidden
							className={cn(
								'h-1.25 min-w-px flex-1 rounded-xs',
								i < filled
									? 'bg-foreground'
									: 'bg-secondary',
							)}
						/>
					))}
				</TooltipTrigger>
				<TooltipContent>{label}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
