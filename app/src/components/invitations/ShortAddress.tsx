// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import { ArrowUpRight } from 'lucide-react';
import { type ReactNode } from 'react';

import { content } from '@/content';
import { cn } from '@/lib/utils';

import { buttonVariants } from '../ui/button';
import { CopyButton } from '../ui/CopyButton';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../ui/tooltip';

// The tooltip's buttons: light on its dark fill.
const tooltipButtonClass =
	'shrink-0 text-background hover:bg-background/15 hover:text-background';

/**
 * A shortened address that shows the full one on hover or keyboard
 * focus, with a copy button and, given an explorer URL, a link there.
 * Renders the short form unless children say otherwise (an account name
 * that falls back to the address).
 */
export function ShortAddress({
	address,
	explorerUrl,
	className,
	children,
}: {
	address: string;
	explorerUrl?: string | null;
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
						'cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
						className,
					)}
				>
					{children ?? formatAddress(address)}
				</TooltipTrigger>
				<TooltipContent className="max-w-[calc(100vw-2rem)] gap-2 pr-1.5 font-mono text-11 break-all">
					{address}
					<CopyButton
						value={address}
						className={tooltipButtonClass}
						data-testid="address-copy"
					/>
					{explorerUrl && (
						<a
							href={explorerUrl}
							target="_blank"
							rel="noopener noreferrer"
							className={cn(
								buttonVariants({
									variant: 'ghost',
									size: 'icon',
								}),
								'p-0.5',
								tooltipButtonClass,
							)}
							aria-label={
								content.common.actions.viewOnExplorer
							}
							title={content.common.actions.viewOnExplorer}
							data-testid="address-explorer-link"
						>
							<ArrowUpRight className="h-2.5 w-2.5" />
						</a>
					)}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
