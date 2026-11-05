// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { CircleCheck } from 'lucide-react';
import { type ReactNode } from 'react';

import { content } from '@/content';
import { formatType } from '@/lib/coin-type';

import { Chip } from '../ui/chip';
import { CopyButton } from '../ui/CopyButton';

const COPY = content.assets.tokens;

/**
 * Beside a coin's symbol: a check when verified, a chip when not, nothing
 * while `verified` is unknown (without the registry).
 */
export function VerifiedMark({
	verified,
}: {
	verified: boolean | undefined;
}) {
	if (verified === undefined) return null;
	return verified ? (
		<CircleCheck
			className="size-3.5 shrink-0 fill-foreground text-background"
			role="img"
			aria-label={COPY.verified}
			data-testid="token-verified"
		/>
	) : (
		<Chip
			variant="warning"
			size="sm"
			data-testid="token-unverified"
		>
			{COPY.unverified}
		</Chip>
	);
}

/**
 * A coin's short type in mono, the full one on hover, with its copy
 * button. It adds nothing to its container's width. `wrapCopy` puts
 * something around the button alone, for a row that reacts to presses.
 */
export function CoinTypeLine({
	coinType,
	wrapCopy,
}: {
	coinType: string;
	wrapCopy?: (copy: ReactNode) => ReactNode;
}) {
	const copy = (
		<CopyButton
			value={coinType}
			size="inline"
			successMessage={content.toasts.coinTypeCopied}
			data-testid="token-copy-type"
		/>
	);
	return (
		<span className="flex min-w-0 items-center gap-1 contain-inline-size">
			<span
				className="truncate font-mono text-11 text-muted-foreground"
				title={coinType}
			>
				{formatType(coinType)}
			</span>
			{wrapCopy ? wrapCopy(copy) : copy}
		</span>
	);
}
