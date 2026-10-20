// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from './dialog';

interface ModalProps {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
	size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
	sm: 'sm:max-w-sm',
	md: 'sm:max-w-md',
	lg: 'sm:max-w-lg',
};

/** Thin wrapper over Dialog that keeps the older Modal API. */
export function Modal({
	open,
	onClose,
	children,
	size = 'md',
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
				className={cn('p-6', sizeClasses[size])}
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
			<DialogTitle className="text-lg font-semibold">
				{title}
			</DialogTitle>
		</DialogHeader>
	);
}

export function ModalContent({
	children,
}: {
	children: ReactNode;
}) {
	return <div className="space-y-3">{children}</div>;
}

export function ModalActions({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="flex justify-end gap-3">{children}</div>
	);
}

export function ModalWarning({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="bg-warning border border-warning-border rounded-lg p-3">
			<p className="text-sm text-warning-foreground">
				{children}
			</p>
		</div>
	);
}
