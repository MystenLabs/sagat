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
	Popover,
	PopoverArrow,
	PopoverContent,
	PopoverTrigger,
} from '../ui/popover';
import {
	tooltipArrowClass,
	tooltipPopupClass,
} from '../ui/tooltip';

// The popup's buttons: light on its dark fill, focus ring included.
const popupButtonClass =
	'shrink-0 text-background hover:bg-background/15 hover:text-background focus-visible:border-background focus-visible:ring-background/50';

/**
 * A shortened address that shows the full one on hover, tap, or Enter
 * or Space when focused, with a copy button and, given an explorer URL,
 * a link there. It looks like a tooltip but is a popover, because a
 * tooltip doesn't open on a tap and Tab can't reach its buttons.
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
		<Popover>
			<PopoverTrigger
				openOnHover
				delay={150}
				data-address={address}
				className={cn(
					'cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
					className,
				)}
			>
				{children ?? formatAddress(address)}
			</PopoverTrigger>
			<PopoverContent
				side="top"
				aria-label={content.common.fields.address}
				data-testid="address-popup"
				className={cn(
					tooltipPopupClass,
					'max-w-[calc(100vw-2rem)] gap-2 pr-1.5 font-mono text-11 break-all ring-0 duration-150',
				)}
			>
				{address}
				<CopyButton
					value={address}
					className={popupButtonClass}
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
							popupButtonClass,
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
				<PopoverArrow className={tooltipArrowClass} />
			</PopoverContent>
		</Popover>
	);
}
