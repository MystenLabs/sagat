// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '@/content';
import { docsUrl } from '@/lib/docs';
import { cn } from '@/lib/utils';

/** "Learn more" after a sentence, opening a docs page in a new tab. */
export function LearnMoreLink({
	path,
	className,
}: {
	/** The docs path, like `/security/trust-model#check-what-you-sign`. */
	path: string;
	className?: string;
}) {
	return (
		<a
			href={docsUrl(path)}
			target="_blank"
			rel="noopener noreferrer"
			className={cn(
				'cursor-pointer underline underline-offset-2 hover:no-underline',
				className,
			)}
			data-testid="learn-more-link"
		>
			{content.common.actions.learnMore}
		</a>
	);
}
