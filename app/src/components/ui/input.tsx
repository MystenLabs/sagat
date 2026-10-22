// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Input as InputPrimitive } from '@base-ui/react/input';
import {
	cva,
	type VariantProps,
} from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The field's box, shared by `Input`, `Textarea`, `SelectTrigger` and
 * `InputGroup`: border-only focus, red when invalid, muted when disabled.
 */
const fieldFrame =
	'rounded-md border border-foreground/12 bg-card transition-colors outline-none focus-visible:border-foreground aria-invalid:border-error-foreground disabled:cursor-not-allowed disabled:bg-muted';

/**
 * The field's text. `text-field` is 16px on phones (so iOS does not zoom
 * on focus) and 14px from `md`; a caller's `text-12` replaces it.
 */
const fieldText =
	'text-field text-foreground placeholder:text-muted-foreground/70 disabled:text-muted-foreground';

/** Field heights, shared with `InputGroup`: 38, 42 and 46px. */
const inputSizes = {
	sm: 'h-9.5',
	md: 'h-10.5',
	lg: 'h-11.5',
} as const;

const inputVariants = cva(
	[fieldFrame, fieldText, 'w-full min-w-0 px-3'],
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
export { fieldFrame, fieldText, Input, inputSizes };
