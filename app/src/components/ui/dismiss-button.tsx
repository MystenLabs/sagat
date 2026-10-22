// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { X } from 'lucide-react';
import { type ComponentProps } from 'react';

import { cn } from '@/lib/utils';

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from './tooltip';

/** The X that closes a banner, with a "Dismiss" tooltip. */
export function DismissButton({
	onClick,
	className,
	iconClassName = 'size-4',
	...props
}: Omit<
	ComponentProps<typeof TooltipTrigger>,
	'children' | 'className' | 'onClick' | 'type'
> & {
	onClick: () => void;
	className?: string;
	iconClassName?: string;
}) {
	return (
		<TooltipProvider delay={150}>
			<Tooltip>
				<TooltipTrigger
					type="button"
					aria-label="Dismiss"
					onClick={onClick}
					className={cn(
						'cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
						className,
					)}
					{...props}
				>
					<X className={iconClassName} />
				</TooltipTrigger>
				<TooltipContent>Dismiss</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
