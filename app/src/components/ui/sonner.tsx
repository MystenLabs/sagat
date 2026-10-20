// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	CheckIcon,
	InfoIcon,
	Loader2Icon,
	TriangleAlertIcon,
} from 'lucide-react';
import {
	Toaster as Sonner,
	type ToasterProps,
} from 'sonner';

/**
 * Toasts from the designs: one dark pill for every type, bottom centre of
 * the content area, the icon alone tells success from failure. Success and
 * copy toasts close after four seconds; errors stay until closed (see
 * `lib/toast.ts`, which sets that per call).
 */
const Toaster = (props: ToasterProps) => (
	<Sonner
		position="bottom-center"
		duration={4000}
		gap={8}
		visibleToasts={3}
		expand
		className="toaster"
		icons={{
			success: <CheckIcon className="size-4" />,
			info: <InfoIcon className="size-4" />,
			warning: (
				<TriangleAlertIcon className="size-4 text-warning-foreground" />
			),
			error: (
				<TriangleAlertIcon className="size-4 text-error-foreground" />
			),
			loading: (
				<Loader2Icon className="size-4 animate-spin" />
			),
		}}
		// Toasts are positioned absolutely inside the list, so the list needs
		// a real width; each pill then centres itself within it.
		style={
			{
				'--width': 'min(560px, calc(100vw - 2rem))',
			} as React.CSSProperties
		}
		toastOptions={{
			unstyled: true,
			classNames: {
				toast:
					'right-0 left-0 mx-auto flex w-fit max-w-full items-center gap-2.5 rounded-xl bg-toast px-4 py-3 font-sans text-14 text-toast-foreground shadow-toast outline-none',
				icon: 'flex size-4 shrink-0 items-center justify-center select-none [&>svg]:size-4',
				content: 'flex min-w-0 items-baseline gap-2.5',
				title: 'font-medium leading-[1.4]',
				description: 'text-13 text-toast-foreground/60',
				actionButton:
					'shrink-0 cursor-pointer text-14 text-toast-foreground/60 underline underline-offset-4 hover:text-toast-foreground',
				cancelButton:
					'shrink-0 cursor-pointer text-14 text-toast-foreground/60 underline underline-offset-4 hover:text-toast-foreground',
				closeButton:
					'order-last static! ml-0.5 flex size-4! shrink-0 translate-0! cursor-pointer items-center justify-center rounded-sm border-0! bg-transparent! text-toast-foreground/60 hover:bg-transparent! hover:text-toast-foreground [&>svg]:size-3.5',
			},
		}}
		{...props}
	/>
);

export { Toaster };
