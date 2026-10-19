// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../ui/tooltip';

/**
 * A shortened address that shows the full one on hover or keyboard
 * focus. Renders the short form unless children say otherwise (an
 * account name that falls back to the address).
 */
export function ShortAddress({
	address,
	className,
	children,
}: {
	address: string;
	className?: string;
	children?: ReactNode;
}) {
	return (
		<TooltipProvider delay={150}>
			<Tooltip>
				<TooltipTrigger
					type="button"
					data-address={address}
					className={cn(
						'cursor-default rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
						className,
					)}
				>
					{children ?? formatAddress(address)}
				</TooltipTrigger>
				<TooltipContent className="max-w-[calc(100vw-2rem)] font-mono text-11 break-all">
					{address}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
