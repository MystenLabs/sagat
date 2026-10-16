// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	cva,
	type VariantProps,
} from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const chipVariants = cva(
	'inline-flex shrink-0 items-center gap-1 rounded-full font-normal whitespace-nowrap uppercase',
	{
		variants: {
			variant: {
				success: 'bg-success text-success-foreground',
				warning: 'bg-warning text-warning-foreground',
				error: 'bg-error text-error-foreground',
				info: 'bg-info text-info-foreground',
				neutral: 'bg-chip text-chip-foreground',
				purple: 'bg-purple text-purple-foreground',
				/** Square, mixed-case category chip (key type, network). */
				tag: 'rounded-sm bg-chip text-chip-foreground normal-case tracking-normal',
			},
			size: {
				sm: 'px-1.5 py-0.5 text-10',
				md: 'px-2 py-1 text-10',
				lg: 'px-2.5 py-1 text-11 tracking-[0.02em]',
			},
		},
		defaultVariants: {
			variant: 'neutral',
			size: 'md',
		},
	},
);

export interface ChipProps
	extends
		React.HTMLAttributes<HTMLSpanElement>,
		VariantProps<typeof chipVariants> {}

const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
	({ className, variant, size, ...props }, ref) => {
		return (
			<span
				className={cn(
					chipVariants({ variant, size, className }),
				)}
				ref={ref}
				{...props}
			/>
		);
	},
);
Chip.displayName = 'Chip';

// eslint-disable-next-line react-refresh/only-export-components
export { Chip, chipVariants };
