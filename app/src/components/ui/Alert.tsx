// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	cva,
	type VariantProps,
} from 'class-variance-authority';
import {
	AlertCircle,
	AlertTriangle,
	Check,
	Info,
} from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Inline notice on a status tint: coloured text over a translucent fill. */
const alertVariants = cva(
	'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-13',
	{
		variants: {
			variant: {
				info: 'border-info-border bg-info text-info-foreground',
				warning:
					'border-warning-border bg-warning text-warning-foreground',
				error:
					'border-error-border bg-error text-error-foreground',
				success:
					'border-success-border bg-success text-success-foreground',
			},
		},
		defaultVariants: {
			variant: 'info',
		},
	},
);

const variantIcons = {
	info: Info,
	warning: AlertTriangle,
	error: AlertCircle,
	success: Check,
};

interface AlertProps extends VariantProps<
	typeof alertVariants
> {
	children: ReactNode;
	showIcon?: boolean;
	className?: string;
}

export function Alert({
	variant = 'info',
	children,
	showIcon = true,
	className,
	...props
}: AlertProps & React.ComponentProps<'div'>) {
	const Icon = variantIcons[variant!];

	return (
		<div
			role={variant === 'error' ? 'alert' : 'status'}
			className={cn(alertVariants({ variant }), className)}
			{...props}
		>
			{showIcon && (
				<Icon
					className="mt-0.5 size-4 shrink-0"
					strokeWidth={variant === 'success' ? 3 : 2}
				/>
			)}
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}
