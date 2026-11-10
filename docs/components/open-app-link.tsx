// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { buttonVariants } from 'fumadocs-ui/components/ui/button';

import { appUrl } from '@/lib/site';

export const openAppLabel = 'Open app';

export function OpenAppLink({
	className,
}: {
	className?: string;
}) {
	return (
		<a
			href={appUrl}
			target="_blank"
			rel="noreferrer noopener"
			className={buttonVariants({
				variant: 'primary',
				size: 'sm',
				className: ['whitespace-nowrap px-2.5', className],
			})}
		>
			{openAppLabel}
			<svg
				aria-hidden
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
				className="size-3.5"
			>
				<path d="M7 7h10v10" />
				<path d="M7 17 17 7" />
			</svg>
		</a>
	);
}
