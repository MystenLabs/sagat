// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Input as InputPrimitive } from '@base-ui/react/input';
import {
	cva,
	type VariantProps,
} from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/** Field heights, shared with `InputGroup`: 38, 42 and 46px. */
const inputSizes = {
	sm: 'h-9.5',
	md: 'h-10.5',
	lg: 'h-11.5',
} as const;

const inputVariants = cva(
	'w-full min-w-0 rounded-md border border-foreground/12 bg-card px-3 text-14 text-foreground transition-colors outline-none placeholder:text-muted-foreground/70 focus-visible:border-foreground aria-invalid:border-error-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
	{
		variants: { size: inputSizes },
		defaultVariants: { size: 'md' },
	},
);

const Input = React.forwardRef<
	HTMLInputElement,
	Omit<React.ComponentProps<'input'>, 'size'> &
		VariantProps<typeof inputVariants>
>(({ className, type, size = 'md', ...props }, ref) => {
	return (
		<InputPrimitive
			type={type}
			ref={ref}
			data-slot="input"
			data-size={size}
			className={cn(inputVariants({ size }), className)}
			{...props}
		/>
	);
});
Input.displayName = 'Input';

// eslint-disable-next-line react-refresh/only-export-components
export { Input, inputSizes };
