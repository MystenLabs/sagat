// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import { content } from '@/content';

const COPY = content.shell.alpha;

/**
 * The ALPHA pill beside the wordmark. Hovering, focusing or clicking it
 * explains what alpha means here. Hidden on the icon rail.
 */
export function AlphaBadge() {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				openOnHover
				delay={150}
				aria-label={COPY.title}
				data-testid="alpha-badge"
				// Base UI opens on hover and click; keyboard focus opens it too.
				// A mouse press focuses without :focus-visible, so a click
				// still toggles.
				onFocus={(event) => {
					if (event.currentTarget.matches(':focus-visible'))
						setOpen(true);
				}}
				className="cursor-pointer rounded-full border border-sidebar-foreground/20 bg-sidebar-foreground/12 px-1.5 py-0.75 font-mono text-10 leading-none tracking-[0.04em] text-sidebar-foreground uppercase outline-none hover:border-sidebar-foreground/24 hover:bg-sidebar-foreground/16 focus-visible:ring-2 focus-visible:ring-sidebar-ring data-popup-open:border-sidebar-foreground/24 data-popup-open:bg-sidebar-foreground/16 group-data-[collapsible=icon]:hidden"
			>
				{COPY.badge}
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="start"
				className="w-75"
				// Nothing to interact with inside: focus stays on the pill, so
				// Escape closes it without the focus coming back and reopening.
				initialFocus={false}
				finalFocus={false}
				data-testid="alpha-popover"
			>
				<p className="text-16 font-medium">{COPY.title}</p>
				<p className="mt-2 text-13 text-foreground-secondary">
					{COPY.body}
				</p>
			</PopoverContent>
		</Popover>
	);
}
