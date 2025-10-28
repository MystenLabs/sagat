// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDownIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

const Accordion = React.forwardRef<
	React.ElementRef<typeof AccordionPrimitive.Root>,
	React.ComponentPropsWithoutRef<
		typeof AccordionPrimitive.Root
	>
>((props, ref) => {
	return (
		<AccordionPrimitive.Root
			data-slot="accordion"
			ref={ref}
			{...props}
		/>
	);
});
Accordion.displayName = 'Accordion';

const AccordionItem = React.forwardRef<
	React.ElementRef<typeof AccordionPrimitive.Item>,
	React.ComponentPropsWithoutRef<
		typeof AccordionPrimitive.Item
	>
>(({ className, ...props }, ref) => {
	return (
		<AccordionPrimitive.Item
			ref={ref}
			data-slot="accordion-item"
			className={cn('border-b last:border-b-0', className)}
			{...props}
		/>
	);
});
AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = React.forwardRef<
	React.ElementRef<typeof AccordionPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<
		typeof AccordionPrimitive.Trigger
	>
>(({ className, children, ...props }, ref) => {
	return (
		<AccordionPrimitive.Header className="flex">
			<AccordionPrimitive.Trigger
				ref={ref}
				data-slot="accordion-trigger"
				className={cn(
					'focus-visible:border-ring cursor-pointer focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180',
					className,
				)}
				{...props}
			>
				{children}
				<ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
			</AccordionPrimitive.Trigger>
		</AccordionPrimitive.Header>
	);
});
AccordionTrigger.displayName = 'AccordionTrigger';

const AccordionContent = React.forwardRef<
	React.ElementRef<typeof AccordionPrimitive.Content>,
	React.ComponentPropsWithoutRef<
		typeof AccordionPrimitive.Content
	>
>(({ className, children, ...props }, ref) => {
	return (
		<AccordionPrimitive.Content
			ref={ref}
			data-slot="accordion-content"
			className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
			{...props}
		>
			<div className={cn('pt-0 pb-4', className)}>
				{children}
			</div>
		</AccordionPrimitive.Content>
	);
});
AccordionContent.displayName = 'AccordionContent';

export {
	Accordion,
	AccordionItem,
	AccordionTrigger,
	AccordionContent,
};
