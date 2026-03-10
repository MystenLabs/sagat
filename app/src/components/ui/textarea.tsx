// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from 'react';

import { cn } from '../../lib/utils';

export type TextareaProps =
	React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<
	HTMLTextAreaElement,
	TextareaProps
>(({ className, ...props }, ref) => {
	return (
		<textarea
			className={cn(
				'flex min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm',
				'placeholder:text-muted-foreground/50',
				'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
				'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
				className,
			)}
			ref={ref}
			{...props}
		/>
	);
});
Textarea.displayName = 'Textarea';

export { Textarea };
