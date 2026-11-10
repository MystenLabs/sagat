// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from '@/lib/utils';

import { SignerName } from './SignerName';

/**
 * A member named inline, as "Maya (you)": their key's name, or their short
 * address when the key has no name.
 */
export function MemberName({
	address,
	label,
	isYou,
	className,
	testId,
}: {
	address: string;
	label: string | null;
	isYou: boolean;
	className?: string;
	testId?: string;
}) {
	return (
		<span
			className={cn('inline-flex min-w-0', className)}
			data-testid={testId}
			data-address={address}
		>
			{/* The name stands alone here; the address only when unnamed. */}
			<SignerName
				label={label}
				address={label ? undefined : address}
				marker={isYou ? 'you' : null}
				markerStyle="parens"
				size="inline"
			/>
		</span>
	);
}
