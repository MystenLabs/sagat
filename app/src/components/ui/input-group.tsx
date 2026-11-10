// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Input as InputPrimitive } from '@base-ui/react/input';
import {
	cva,
	type VariantProps,
} from 'class-variance-authority';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
	fieldFrame,
	fieldText,
	inputSizes,
} from '@/components/ui/input';
import { cn } from '@/lib/utils';

const inputGroupVariants = cva(
	[
		fieldFrame,
		// Focus anywhere inside (the control or an addon's button) darkens
		// the border. The warning tone replaces the red invalid border (a
		// signer with no public key yet), so the invalid rule skips it; its
		// :has() outweighs :focus-within, so an invalid field stays red.
		'group/input-group relative flex w-full min-w-0 items-center in-data-[slot=combobox-content]:focus-within:border-inherit has-disabled:bg-muted focus-within:border-foreground not-data-[tone=warning]:has-[[data-slot][aria-invalid=true]]:border-error-foreground data-[tone=warning]:border-warning-border data-[tone=warning]:focus-within:border-warning-foreground has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5',
	],
	{
		variants: { size: inputSizes },
		defaultVariants: { size: 'md' },
	},
);

/**
 * A field with addons: the wrapper draws the border, background and
 * height of `Input`, and the control inside draws none of them.
 * `tone="warning"` gives it a yellow border.
 */
function InputGroup({
	className,
	size = 'md',
	tone,
	...props
}: React.ComponentProps<'div'> &
	VariantProps<typeof inputGroupVariants> & {
		tone?: 'warning';
	}) {
	return (
		<div
			data-slot="input-group"
			data-size={size}
			data-tone={tone}
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
	"flex h-auto cursor-text items-center justify-center gap-2 text-14 font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-xs [&>svg:not([class*='size-'])]:size-4",
	{
		variants: {
			align: {
				// Inline addons sit 4px from the edge and fill the field's
				// height; the control keeps 6px before them.
				'inline-start': 'order-first pl-1',
				'inline-end': 'order-last pr-1',
				'block-start':
					'order-first w-full justify-start px-2.5 pt-2 pb-1.5 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2',
				'block-end':
					'order-last w-full justify-start px-2.5 pt-1.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2',
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

// Forward the ref: a Base UI trigger's `render` prop hands it one.
const InputGroupButton = React.forwardRef<
	HTMLButtonElement,
	Omit<
		React.ComponentPropsWithoutRef<typeof Button>,
		'size' | 'type'
	> &
		VariantProps<typeof inputGroupButtonVariants> & {
			type?: 'button' | 'submit' | 'reset';
		}
>(
	(
		{
			className,
			type = 'button',
			variant = 'ghost',
			size = 'xs',
			...props
		},
		ref,
	) => {
		return (
			<Button
				ref={ref}
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
	},
);
InputGroupButton.displayName = 'InputGroupButton';

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

// The control draws no box of its own: the group does. Forward the ref
// so a caller can focus it, as `Input` does.
const InputGroupInput = React.forwardRef<
	HTMLInputElement,
	Omit<React.ComponentPropsWithoutRef<'input'>, 'size'>
>(({ className, ...props }, ref) => {
	return (
		<InputPrimitive
			ref={ref}
			data-slot="input-group-control"
			className={cn(
				fieldText,
				'h-full min-w-0 flex-1 bg-transparent px-3 outline-none',
				className,
			)}
			{...props}
		/>
	);
});
InputGroupInput.displayName = 'InputGroupInput';

const InputGroupTextarea = React.forwardRef<
	HTMLTextAreaElement,
	React.ComponentPropsWithoutRef<'textarea'>
>(({ className, ...props }, ref) => {
	return (
		<textarea
			ref={ref}
			data-slot="input-group-control"
			className={cn(
				fieldText,
				'h-full min-w-0 flex-1 resize-none bg-transparent px-3 py-2 outline-none',
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
