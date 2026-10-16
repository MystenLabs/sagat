// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { AlertCircle, type LucideIcon } from 'lucide-react';
import { isValidElement, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Button } from './button';

interface EmptyStateProps {
	/** A lucide icon, or a ready-made element for custom tiles. */
	icon?: LucideIcon | ReactNode;
	title: string;
	description?: string;
	action?: ReactNode;
	/** `card` draws the bordered shell; `plain` sits inside an existing one. */
	variant?: 'card' | 'plain';
	className?: string;
	testId?: string;
}

/**
 * Nothing here yet: an icon tile, a title, one line of explanation and an
 * optional action, centred in a card shell like the lists it replaces.
 */
export function EmptyState({
	icon,
	title,
	description,
	action,
	variant = 'card',
	className,
	testId,
}: EmptyStateProps) {
	return (
		<div
			data-testid={testId}
			className={cn(
				'flex flex-col items-center px-6 py-14 text-center',
				variant === 'card' && 'rounded-2xl border bg-card',
				className,
			)}
		>
			{icon && <IconTile icon={icon} />}
			<h3 className="text-16 font-semibold">{title}</h3>
			{description && (
				<p className="mt-1.5 max-w-sm text-13 text-muted-foreground">
					{description}
				</p>
			)}
			{action && (
				<div className="mt-5 flex items-center gap-2">
					{action}
				</div>
			)}
		</div>
	);
}

interface ErrorStateProps {
	title?: string;
	error?: unknown;
	/** Shown when the error has no message of its own. */
	fallback?: string;
	onRetry?: () => void;
	retryLabel?: string;
	variant?: 'card' | 'plain';
	className?: string;
	testId?: string;
}

/** Something failed to load: the same shell on the error tint. */
export function ErrorState({
	title = 'Something went wrong',
	error,
	fallback = 'Try again in a moment.',
	onRetry,
	retryLabel = 'Try again',
	variant = 'card',
	className,
	testId,
}: ErrorStateProps) {
	const message =
		error instanceof Error && error.message
			? error.message
			: typeof error === 'string' && error
				? error
				: fallback;
	return (
		<div
			role="alert"
			data-testid={testId}
			className={cn(
				'flex flex-col items-center px-6 py-14 text-center',
				variant === 'card' &&
					'rounded-2xl border border-error-border bg-card',
				className,
			)}
		>
			<IconTile icon={AlertCircle} tone="error" />
			<h3 className="text-16 font-semibold">{title}</h3>
			<p className="mt-1.5 max-w-sm text-13 break-words text-muted-foreground">
				{message}
			</p>
			{onRetry && (
				<Button
					variant="outline"
					size="sm"
					className="mt-5"
					onClick={onRetry}
				>
					{retryLabel}
				</Button>
			)}
		</div>
	);
}

function IconTile({
	icon,
	tone = 'neutral',
}: {
	icon: LucideIcon | ReactNode;
	tone?: 'neutral' | 'error';
}) {
	if (isValidElement(icon))
		return <div className="mb-4">{icon}</div>;
	const Icon = icon as LucideIcon;
	return (
		<div
			className={cn(
				'mb-4 flex size-10 items-center justify-center rounded-xl',
				tone === 'error'
					? 'bg-error text-error-foreground'
					: 'bg-muted text-muted-foreground',
			)}
		>
			<Icon className="size-5" />
		</div>
	);
}
