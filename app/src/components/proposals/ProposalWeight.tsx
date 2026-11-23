// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '@/content';
import {
	weightDots,
	type CountedSignerSet,
} from '@/lib/proposalUtils';
import { cn } from '@/lib/utils';

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../ui/tooltip';

/**
 * A proposal's signature weight in a signer set against the set's
 * threshold as a row of dots, one per unit of weight, filled as
 * signatures come in. The exact numbers ("2 of 4") sit in a tooltip.
 */
export function ProposalWeight({
	signerSet,
	className,
}: {
	signerSet: Pick<
		CountedSignerSet,
		'currentWeight' | 'threshold'
	>;
	className?: string;
}) {
	const weight = {
		currentWeight: signerSet.currentWeight,
		totalWeight: signerSet.threshold,
	};
	const { dots, filled } = weightDots(weight);
	const label = content.proposals.weight.label(
		weight.currentWeight,
		weight.totalWeight,
	);
	return (
		<TooltipProvider delay={150}>
			<Tooltip>
				<TooltipTrigger
					// Not a button, so a click falls through to the row.
					render={<span role="img" tabIndex={0} />}
					aria-label={content.proposals.weight.ariaLabel(
						label,
					)}
					className={cn(
						'flex w-fit gap-0.75 rounded-sm py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring',
						className,
					)}
					data-testid="proposal-weight"
					data-current-weight={weight.currentWeight}
					data-total-weight={weight.totalWeight}
				>
					{Array.from({ length: dots }, (_, i) => (
						<span
							key={i}
							aria-hidden
							className={cn(
								'size-1.25 shrink-0 rounded-full',
								i < filled
									? 'bg-foreground'
									: 'bg-foreground/20',
							)}
						/>
					))}
				</TooltipTrigger>
				<TooltipContent>{label}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
