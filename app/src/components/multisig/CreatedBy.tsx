// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { cn } from '@/lib/utils';

import { type AccountCreator } from './account-setup';

/**
 * Who created the account: their key's name ("Maya (you)"), their short
 * address when the key has no name, or "Unknown" for accounts from before
 * the API recorded it.
 */
export function CreatedBy({
	creator,
	className,
	testId = 'account-created-by',
}: {
	creator: AccountCreator | null;
	className?: string;
	testId?: string;
}) {
	if (!creator)
		return (
			<span
				className={cn('text-muted-foreground', className)}
				data-testid={testId}
			>
				Unknown
			</span>
		);
	const you = creator.isYou ? ' (you)' : '';
	return (
		<span
			className={cn(
				'inline-flex min-w-0 items-center gap-1',
				className,
			)}
			data-testid={testId}
			data-address={creator.address}
		>
			{creator.label ? (
				<span className="truncate">
					{creator.label}
					{you}
				</span>
			) : (
				<>
					<ShortAddress
						address={creator.address}
						className="font-mono"
					/>
					{you}
				</>
			)}
		</span>
	);
}
