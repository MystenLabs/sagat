// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	cva,
	type VariantProps,
} from 'class-variance-authority';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input, inputSizes } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const inputGroupVariants = cva(
	// The warning tone replaces the red invalid border (a signer with no
	// public key yet), so the invalid rule skips it.
	'group/input-group relative flex w-full min-w-0 items-center rounded-md border border-foreground/12 bg-card transition-colors outline-none in-data-[slot=combobox-content]:focus-within:border-inherit has-disabled:bg-muted has-[[data-slot=input-group-control]:focus-visible]:border-foreground not-data-[tone=warning]:has-[[data-slot][aria-invalid=true]]:border-error-foreground data-[tone=warning]:border-warning-border data-[tone=warning]:has-[[data-slot=input-group-control]:focus-visible]:border-warning-foreground has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5',
	{
		variants: { size: inputSizes },
		defaultVariants: { size: 'md' },
	},
);

/**
 * A field with addons: the wrapper draws the border, background and
 * height of `Input`, and the control inside draws none of them.
 * `data-tone="warning"` gives it a yellow border.
 */
function InputGroup({
	className,
	size = 'md',
	...props
}: React.ComponentProps<'div'> &
	VariantProps<typeof inputGroupVariants>) {
	return (
		<div
			data-slot="input-group"
			data-size={size}
			role="group"
			className={cn(
				inputGroupVariants({ size }),
				className,
			)}
			{...props}
		/>
	);
}

const inputGroupAddonVariants = cva(
	"flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-14 font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-xs [&>svg:not([class*='size-'])]:size-4",
	{
		variants: {
			align: {
				'inline-start':
					'order-first pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]',
				'inline-end':
					'order-last pr-2 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem]',
				'block-start':
					'order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2',
				'block-end':
					'order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2',
			},
		},
		defaultVariants: {
			align: 'inline-start',
		},
	},
);

function InputGroupAddon({
	className,
	align = 'inline-start',
	...props
}: React.ComponentProps<'div'> &
	VariantProps<typeof inputGroupAddonVariants>) {
	return (
		<div
			role="group"
			data-slot="input-group-addon"
			data-align={align}
			className={cn(
				inputGroupAddonVariants({ align }),
				className,
			)}
			onClick={(e) => {
				if ((e.target as HTMLElement).closest('button')) {
					return;
				}
				e.currentTarget.parentElement
					?.querySelector('input')
					?.focus();
			}}
			{...props}
		/>
	);
}

const inputGroupButtonVariants = cva(
	'flex items-center gap-2 text-13 shadow-none',
	{
		variants: {
			size: {
				xs: "h-6 gap-1 rounded-sm px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
				sm: '',
				'icon-xs': 'size-6 rounded-sm p-0 has-[>svg]:p-0',
				'icon-sm': 'size-8 p-0 has-[>svg]:p-0',
			},
		},
		defaultVariants: {
			size: 'xs',
		},
	},
);

function InputGroupButton({
	className,
	type = 'button',
	variant = 'ghost',
	size = 'xs',
	...props
}: Omit<
	React.ComponentProps<typeof Button>,
	'size' | 'type'
> &
	VariantProps<typeof inputGroupButtonVariants> & {
		type?: 'button' | 'submit' | 'reset';
	}) {
	return (
		<Button
			type={type}
			data-size={size}
			variant={variant}
			className={cn(
				inputGroupButtonVariants({ size }),
				className,
			)}
			{...props}
		/>
	);
}

function InputGroupText({
	className,
	...props
}: React.ComponentProps<'span'>) {
	return (
		<span
			className={cn(
				"flex items-center gap-2 text-14 text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		/>
	);
}

// Forward the ref so a caller can focus the control, as `Input` does.
const InputGroupInput = React.forwardRef<
	HTMLInputElement,
	Omit<React.ComponentProps<typeof Input>, 'size' | 'ref'>
>(({ className, ...props }, ref) => {
	return (
		<Input
			ref={ref}
			data-slot="input-group-control"
			className={cn(
				'h-full flex-1 rounded-none border-0 bg-transparent disabled:bg-transparent',
				className,
			)}
			{...props}
		/>
	);
});
InputGroupInput.displayName = 'InputGroupInput';

const InputGroupTextarea = React.forwardRef<
	HTMLTextAreaElement,
	React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => {
	return (
		<Textarea
			ref={ref}
			data-slot="input-group-control"
			className={cn(
				'h-full flex-1 resize-none rounded-none border-0 bg-transparent py-2 disabled:bg-transparent',
				className,
			)}
			{...props}
		/>
	);
});
InputGroupTextarea.displayName = 'InputGroupTextarea';

export {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupText,
	InputGroupInput,
	InputGroupTextarea,
};
