// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '@/content';
import { type AccountCreator } from '@/lib/account-setup';
import { cn } from '@/lib/utils';

import { MemberName } from './MemberName';

/**
 * Who created the account: their key's name ("Maya (you)"), their short
 * address when the key has no name, or "Unknown" for accounts from before
 * the API recorded it.
 */
export function CreatedBy({
	creator,
	className,
	testId,
}: {
	creator: AccountCreator | null;
	className?: string;
	testId: string;
}) {
	if (!creator)
		return (
			<span
				className={cn('text-muted-foreground', className)}
				data-testid={testId}
			>
				{content.overview.creatorUnknown}
			</span>
		);
	return (
		<MemberName
			address={creator.address}
			label={creator.label}
			isYou={creator.isYou}
			className={className}
			testId={testId}
		/>
	);
}
