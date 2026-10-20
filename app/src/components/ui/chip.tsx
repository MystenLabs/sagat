// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	cva,
	type VariantProps,
} from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const chipVariants = cva(
	'inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full shrink-0 font-medium',
	{
		variants: {
			variant: {
				success: 'bg-success text-success-foreground',
				warning: 'bg-warning text-warning-foreground',
				error: 'bg-error text-error-foreground',
				info: 'bg-info text-info-foreground',
				neutral: 'bg-muted text-muted-foreground',
				purple: 'bg-purple text-purple-foreground',
			},
			size: {
				sm: 'text-xs px-1.5 py-0.5',
				md: 'text-xs px-2 py-1',
				lg: 'text-sm px-3 py-1.5',
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
