// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

/** The card shell: a bordered panel with its content stacked. */
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
}: {
	id?: string;
	title: ReactNode;
	count?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
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
