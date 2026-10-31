// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { AlertCircle } from 'lucide-react';
import { type ComponentType, type ReactNode } from 'react';

import { content } from '@/content';
import { cn, errorMessage } from '@/lib/utils';

import { Button } from './button';

/** A lucide icon or any icon component that takes a className. */
type IconComponent = ComponentType<{ className?: string }>;

interface EmptyStateProps {
	icon?: IconComponent;
	/** Extra classes for the icon tile, e.g. a brand tint. */
	iconClassName?: string;
	title: string;
	description?: string;
	/** A line between the description and the action, e.g. an error. */
	note?: ReactNode;
	action?: ReactNode;
	className?: string;
	testId?: string;
}

/**
 * Nothing here yet: an icon tile, a title, one line of explanation and an
 * optional action, centred in a card shell like the lists it replaces.
 */
export function EmptyState({
	icon,
	iconClassName,
	title,
	description,
	note,
	action,
	className,
	testId,
}: EmptyStateProps) {
	return (
		<div
			data-testid={testId}
			className={cn(
				'flex flex-col items-center rounded-2xl border bg-card px-6 py-14 text-center',
				className,
			)}
		>
			{icon && (
				<IconTile icon={icon} className={iconClassName} />
			)}
			<h3 className="text-16 font-semibold">{title}</h3>
			{description && (
				<p className="mt-1.5 max-w-sm text-13 text-muted-foreground">
					{description}
				</p>
			)}
			{note && <div className="mt-3">{note}</div>}
			{action && (
				<div className="mt-5 flex items-center gap-2">
					{action}
				</div>
			)}
		</div>
	);
}

interface ErrorStateProps {
	icon?: IconComponent;
	title?: string;
	error?: unknown;
	/** Shown when the error has no message of its own. */
	fallback?: string;
	/** A line under the message, shown whatever the error says. */
	hint?: string;
	onRetry?: () => void;
	/** A retry is in flight: the button is disabled and says so. */
	retrying?: boolean;
	retryTestId?: string;
	className?: string;
	testId?: string;
}

/** Something failed to load: the same shell on the error tint. */
export function ErrorState({
	icon = AlertCircle,
	title = content.states.error.title,
	error,
	fallback = content.states.error.fallback,
	hint,
	onRetry,
	retrying = false,
	retryTestId,
	className,
	testId,
}: ErrorStateProps) {
	const message = errorMessage(error, fallback);
	return (
		<div
			role="alert"
			data-testid={testId}
			className={cn(
				'flex flex-col items-center rounded-2xl border border-error-border bg-card px-6 py-14 text-center',
				className,
			)}
		>
			<IconTile icon={icon} tone="error" />
			<h3 className="text-16 font-semibold">{title}</h3>
			<p className="mt-1.5 max-w-sm text-13 break-words text-muted-foreground">
				{message}
			</p>
			{hint && (
				<p className="mt-1 max-w-sm text-13 text-muted-foreground">
					{hint}
				</p>
			)}
			{onRetry && (
				<Button
					variant="outline"
					size="sm"
					className="mt-5"
					onClick={onRetry}
					disabled={retrying}
					data-testid={retryTestId}
				>
					{retrying
						? content.common.states.retrying
						: content.common.actions.tryAgain}
				</Button>
			)}
		</div>
	);
}

function IconTile({
	icon: Icon,
	tone = 'neutral',
	className,
}: {
	icon: IconComponent;
	tone?: 'neutral' | 'error';
	className?: string;
}) {
	return (
		<div
			className={cn(
				'mb-4 flex size-10 items-center justify-center rounded-xl',
				tone === 'error'
					? 'bg-error text-error-foreground'
					: 'bg-muted text-muted-foreground',
				className,
			)}
		>
			<Icon className="size-5" />
		</div>
	);
}
