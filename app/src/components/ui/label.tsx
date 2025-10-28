// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	cva,
	type VariantProps,
} from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const labelVariants = cva(
	'inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full shrink-0 font-medium',
	{
		variants: {
			variant: {
				success: 'bg-green-100 text-green-800',
				warning: 'bg-orange-100 text-orange-800',
				error: 'bg-red-100 text-red-800',
				info: 'bg-blue-100 text-blue-800',
				neutral: 'bg-gray-100 text-gray-800',
				purple: 'bg-purple-100 text-purple-800',
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

export interface LabelProps
	extends React.HTMLAttributes<HTMLSpanElement>,
		VariantProps<typeof labelVariants> {}

const Label = React.forwardRef<HTMLSpanElement, LabelProps>(
	({ className, variant, size, ...props }, ref) => {
		return (
			<span
				className={cn(
					labelVariants({ variant, size, className }),
				)}
				ref={ref}
				{...props}
			/>
		);
	},
);
Label.displayName = 'Label';

// eslint-disable-next-line react-refresh/only-export-components
export { Label, labelVariants };
