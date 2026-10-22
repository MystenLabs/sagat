// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<
	HTMLTextAreaElement,
	React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => {
	return (
		<textarea
			ref={ref}
			data-slot="textarea"
			className={cn(
				'flex min-h-16 w-full rounded-md border border-foreground/12 bg-card px-3 py-2 text-14 text-foreground transition-colors outline-none placeholder:text-muted-foreground/70 focus-visible:border-foreground aria-invalid:border-error-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
				className,
			)}
			{...props}
		/>
	);
});
Textarea.displayName = 'Textarea';

export { Textarea };
