// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type AccountCreator } from '@/lib/account-setup';
import { cn } from '@/lib/utils';

import { SignerName } from './SignerName';

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
	return (
		<span
			className={cn('inline-flex min-w-0', className)}
			data-testid={testId}
			data-address={creator.address}
		>
			{/* The name stands alone here; the address only when unnamed. */}
			<SignerName
				label={creator.label}
				address={
					creator.label ? undefined : creator.address
				}
				marker={creator.isYou ? 'you' : null}
				markerStyle="parens"
				size="inline"
			/>
		</span>
	);
}
