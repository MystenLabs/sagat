// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import {
	cva,
	type VariantProps,
} from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Sizes follow the redesign: md is 36px, sm is 28px, both radius-md.
const buttonVariants = cva(
	"group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent text-[13px]/[1.4] font-medium transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground hover:bg-primary/85',
				secondary:
					'bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary',
				outline:
					'border-input bg-background text-foreground hover:bg-muted aria-expanded:bg-muted dark:bg-input/30 dark:hover:bg-input/50',
				ghost:
					'hover:bg-muted hover:text-foreground aria-expanded:bg-muted dark:hover:bg-muted/50',
				destructive:
					'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
				outlineDestructive:
					'border-destructive text-destructive hover:bg-destructive/10',
				link: 'text-primary underline-offset-4 hover:underline',
			},
			size: {
				default: 'h-9 px-3.5',
				sm: "h-7 px-2.5 text-xs/[1.3] [&_svg:not([class*='size-'])]:size-3.5",
				xs: "h-6 px-2 text-xs/[1.3] [&_svg:not([class*='size-'])]:size-3",
				lg: 'h-10 px-5',
				icon: 'size-9',
				'icon-sm':
					"size-7 [&_svg:not([class*='size-'])]:size-3.5",
				'icon-xs':
					"size-6 [&_svg:not([class*='size-'])]:size-3",
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

function Button({
	className,
	variant = 'default',
	size = 'default',
	...props
}: ButtonPrimitive.Props &
	VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(
				buttonVariants({ variant, size, className }),
			)}
			{...props}
		/>
	);
}

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
