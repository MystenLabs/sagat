// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** The account tabs' card shell: a bordered panel with its content stacked. */
export const cardClass =
	'flex flex-col gap-3 rounded-xl border bg-card p-5 md:p-6';

/**
 * A card's title line: the title, an optional muted count after it, and
 * whatever trails it. Trailing elements push themselves right with
 * `ml-auto`; the line wraps so a trailing action or summary drops under
 * the title when it does not fit beside it.
 */
export function CardHeading({
	id,
	title,
	count,
	children,
	className,
}: {
	id?: string;
	title: ReactNode;
	count?: ReactNode;
	children?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				'flex flex-wrap items-center gap-2',
				className,
			)}
		>
			<h2 id={id} className="text-16 font-medium">
				{title}
			</h2>
			{count !== undefined && (
				<span className="text-12 text-muted-foreground">
					{count}
				</span>
			)}
			{children}
		</div>
	);
}

/**
 * The card shell with its heading first, labelled by the heading's id so
 * the section reads as its title.
 */
export function Card({
	title,
	titleId,
	count,
	trailing,
	className,
	testId,
	children,
}: {
	title: ReactNode;
	titleId: string;
	count?: ReactNode;
	/** After the title and count; give it `ml-auto` to sit right. */
	trailing?: ReactNode;
	className?: string;
	testId?: string;
	children?: ReactNode;
}) {
	return (
		<section
			className={cn(cardClass, className)}
			aria-labelledby={titleId}
			data-testid={testId}
		>
			<CardHeading id={titleId} title={title} count={count}>
				{trailing}
			</CardHeading>
			{children}
		</section>
	);
}
