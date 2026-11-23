// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '../ui/collapsible';

/** A row inside a card that opens in place: its label, an optional count and a chevron. */
export function FoldedRow({
	label,
	count,
	testId,
	children,
}: {
	label: string;
	count?: number;
	testId: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="flex flex-col gap-3 border-t pt-3"
			data-testid={testId}
		>
			<h3 className="text-13 font-medium">
				<CollapsibleTrigger
					className="flex w-full cursor-pointer items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
					data-testid={`${testId}-toggle`}
				>
					{label}
					{count !== undefined && (
						<span
							className="text-12 font-normal text-muted-foreground"
							data-testid={`${testId}-count`}
						>
							{count}
						</span>
					)}
					<ChevronDown
						aria-hidden
						className={cn(
							'ml-auto size-4 transition-transform',
							open && 'rotate-180',
						)}
					/>
				</CollapsibleTrigger>
			</h3>
			<CollapsibleContent className="flex flex-col gap-3">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
