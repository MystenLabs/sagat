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
	/** `page`: the larger card that fills the rest of a page. */
	size?: 'default' | 'page';
	className?: string;
	testId?: string;
}

/**
 * Nothing here yet: an icon tile, a title, one line of explanation and an
 * optional action, centred in a card shell like the lists it replaces.
 */
export function EmptyState({
	icon: Icon,
	iconClassName,
	title,
	description,
	note,
	action,
	size = 'default',
	className,
	testId,
}: EmptyStateProps) {
	if (size === 'page')
		return (
			<div
				data-testid={testId}
				className={cn(
					'flex flex-1 flex-col items-center justify-center gap-6 rounded-xl border bg-card px-6 py-14 text-center md:px-12',
					className,
				)}
			>
				{Icon && (
					<div
						className={cn(
							'flex size-12 items-center justify-center rounded-full bg-muted text-foreground',
							iconClassName,
						)}
					>
						<Icon className="size-5" />
					</div>
				)}
				<div className="flex flex-col items-center">
					<h3 className="text-18 font-medium">{title}</h3>
					{description && (
						<p className="max-w-130 text-14 text-muted-foreground">
							{description}
						</p>
					)}
				</div>
				{note}
				{action && (
					<div className="flex items-center gap-2">
						{action}
					</div>
				)}
			</div>
		);
	return (
		<div
			data-testid={testId}
			className={cn(
				'flex flex-col items-center rounded-2xl border bg-card px-6 py-14 text-center',
				className,
			)}
		>
			{Icon && (
				<IconTile icon={Icon} className={iconClassName} />
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
	/** The retry button's label; “Try again” by default. */
	retryLabel?: string;
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
	retryLabel = content.common.actions.tryAgain,
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
				'flex flex-col items-center rounded-2xl border bg-card px-6 py-14 text-center',
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
						: retryLabel}
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
