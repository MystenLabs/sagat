// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Check, X } from 'lucide-react';
import { type ReactNode } from 'react';

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../ui/tooltip';

/** A dismissible green note at the top of a page, after a flow ends. */
export function SuccessBanner({
	children,
	onDismiss,
	testId,
}: {
	children: ReactNode;
	onDismiss: () => void;
	testId: string;
}) {
	return (
		<div
			role="status"
			className="mb-6 flex items-center gap-2.5 rounded-lg bg-success-soft px-4 py-3 text-14 font-medium text-success-foreground"
			data-testid={testId}
		>
			<Check
				className="size-4 shrink-0"
				strokeWidth={2.5}
			/>
			<span className="min-w-0 flex-1">{children}</span>
			<TooltipProvider delay={150}>
				<Tooltip>
					<TooltipTrigger
						type="button"
						aria-label="Dismiss"
						className="cursor-pointer rounded-sm opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
						onClick={onDismiss}
						data-testid={`${testId}-dismiss`}
					>
						<X className="size-3.5" />
					</TooltipTrigger>
					<TooltipContent>Dismiss</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
}
