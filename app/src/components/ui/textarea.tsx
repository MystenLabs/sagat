// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from 'react';

import {
	fieldFrame,
	fieldText,
} from '@/components/ui/input';
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
				fieldFrame,
				fieldText,
				'flex min-h-16 w-full px-3 py-2',
				className,
			)}
			{...props}
		/>
	);
});
Textarea.displayName = 'Textarea';

export { Textarea };
