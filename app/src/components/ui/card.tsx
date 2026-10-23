// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	type ComponentPropsWithoutRef,
	type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

/** The account tabs' card shell: a bordered panel with its content stacked. */
export const cardClass =
	'flex flex-col gap-3 rounded-xl border bg-card p-5 md:p-6';

/**
 * A card's title line: the title, an optional muted count after it, and
 * whatever trails it. Trailing elements push themselves right with
 * `ml-auto`.
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
			className={cn('flex items-center gap-2', className)}
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
	headingClassName,
	testId,
	children,
	...rest
}: {
	title: ReactNode;
	titleId: string;
	count?: ReactNode;
	/** After the title and count; give it `ml-auto` to sit right. */
	trailing?: ReactNode;
	/** Only for a heading that has to wrap its trailing (`flex-wrap`). */
	headingClassName?: string;
	testId?: string;
} & Omit<ComponentPropsWithoutRef<'section'>, 'title'>) {
	return (
		<section
			className={cn(cardClass, className)}
			aria-labelledby={titleId}
			data-testid={testId}
			{...rest}
		>
			<CardHeading
				id={titleId}
				title={title}
				count={count}
				className={headingClassName}
			>
				{trailing}
			</CardHeading>
			{children}
		</section>
	);
}
