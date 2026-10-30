// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from './dialog';

type ModalProps = {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
} & Omit<
	ComponentProps<typeof DialogContent>,
	'children' | 'showCloseButton'
>;

/**
 * A dialog with a title, a body and its buttons. Anything else (a test
 * id, `initialFocus`) goes to the dialog's popup.
 */
export function Modal({
	open,
	onClose,
	children,
	className,
	...props
}: ModalProps) {
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				showCloseButton={false}
				className={cn('gap-0 p-6', className)}
				{...props}
			>
				{children}
			</DialogContent>
		</Dialog>
	);
}

interface ModalHeaderProps {
	icon?: ReactNode;
	title: string;
}

export function ModalHeader({
	icon,
	title,
}: ModalHeaderProps) {
	return (
		<DialogHeader className="flex-row items-center gap-3">
			{icon}
			<DialogTitle className="text-20 font-bold">
				{title}
			</DialogTitle>
		</DialogHeader>
	);
}

/**
 * The body, read out with the title. A long unbroken string (an error,
 * an address) wraps rather than widening the dialog.
 */
export function ModalContent({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<DialogDescription
			render={<div />}
			className="mt-2 flex min-w-0 flex-col gap-2 text-14 wrap-anywhere text-muted-foreground"
		>
			{children}
		</DialogDescription>
	);
}

/** The buttons, side by side at equal width. */
export function ModalActions({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="mt-5 grid min-w-0 auto-cols-fr grid-flow-col gap-2 *:min-w-0">
			{children}
		</div>
	);
}
