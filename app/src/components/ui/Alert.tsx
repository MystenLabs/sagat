// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	cva,
	type VariantProps,
} from 'class-variance-authority';
import {
	AlertCircle,
	AlertTriangle,
	CheckCircle,
	Info,
} from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

const alertVariants = cva('p-3 rounded border-l-4', {
	variants: {
		variant: {
			info: 'bg-blue-50 border-blue-500',
			warning: 'bg-yellow-100 border-yellow-500',
			error: 'bg-red-50 border-red-500',
			success: 'bg-green-50 border-green-500',
		},
	},
	defaultVariants: {
		variant: 'info',
	},
});

const alertTextVariants = cva('text-sm', {
	variants: {
		variant: {
			info: 'text-blue-800',
			warning: 'text-yellow-800',
			error: 'text-red-800',
			success: 'text-green-800',
		},
	},
	defaultVariants: {
		variant: 'info',
	},
});

const alertIconVariants = cva('w-5 h-5 flex-shrink-0', {
	variants: {
		variant: {
			info: 'text-blue-600',
			warning: 'text-yellow-700',
			error: 'text-red-600',
			success: 'text-green-600',
		},
	},
	defaultVariants: {
		variant: 'info',
	},
});

const variantIcons = {
	info: Info,
	warning: AlertTriangle,
	error: AlertCircle,
	success: CheckCircle,
};

interface AlertProps
	extends VariantProps<typeof alertVariants> {
	children: ReactNode;
	showIcon?: boolean;
	className?: string;
}

export function Alert({
	variant = 'info',
	children,
	showIcon = true,
	className,
}: AlertProps) {
	const Icon = variantIcons[variant!];

	return (
		<div
			className={cn(alertVariants({ variant }), className)}
		>
			<div className="flex items-center gap-2">
				{showIcon && (
					<Icon
						className={alertIconVariants({ variant })}
					/>
				)}
				<div className={alertTextVariants({ variant })}>
					{children}
				</div>
			</div>
		</div>
	);
}
