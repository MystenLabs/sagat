// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';

import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

import { useExpiry } from '../../hooks/useExpiry';
import {
	expiresSoon,
	formatTimeLeft,
	type Expiry,
} from '../../lib/expiration';
import { Chip } from '../ui/chip';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../ui/tooltip';

// How long a proposal's transaction can still execute, if it expires at
// all: a badge, or with `variant="inline"` plain text for a meta line,
// after a separator that wraps with it, coloured once less than an hour
// is left.
export function ProposalExpiry({
	transactionBytes,
	variant = 'chip',
}: {
	transactionBytes: string;
	variant?: 'chip' | 'inline';
}) {
	const expiry = useExpiry(transactionBytes);
	if (!expiry) return null;
	return variant === 'inline' ? (
		<InlineExpiry expiry={expiry} />
	) : (
		<ExpiryChip expiry={expiry} />
	);
}

// The badge for an expiry from `useExpiry`.
export function ExpiryChip({ expiry }: { expiry: Expiry }) {
	const now = useNow();
	return (
		<TooltipProvider delay={150}>
			<Tooltip>
				<TooltipTrigger
					render={
						<Chip
							variant={expiry.expired ? 'error' : 'neutral'}
							data-testid="proposal-expiry"
							tabIndex={0}
						/>
					}
				>
					{label(expiry, now)}
				</TooltipTrigger>
				<TooltipContent className="max-w-xs">
					{explain(expiry)}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

function InlineExpiry({ expiry }: { expiry: Expiry }) {
	const now = useNow();
	return (
		<span className="inline-flex items-center gap-1.5">
			<span aria-hidden>·</span>
			<TooltipProvider delay={150}>
				<Tooltip>
					<TooltipTrigger
						render={
							<span
								className={cn(
									expiry.expired
										? 'text-error-foreground'
										: expiresSoon(expiry.endsAt, now) &&
												'text-warning-foreground',
								)}
								data-testid="proposal-expiry"
								tabIndex={0}
							/>
						}
					>
						{label(expiry, now)}
					</TooltipTrigger>
					<TooltipContent className="max-w-xs">
						{explain(expiry)}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</span>
	);
}

function label({ expired, endsAt }: Expiry, now: Date) {
	return expired
		? 'Expired'
		: `Expires in ${formatTimeLeft(endsAt, now)}`;
}

function explain({ lastEpoch, expired, endsAt }: Expiry) {
	if (expired)
		return `This transaction could only execute until the end of epoch ${lastEpoch}, so it can't run anymore. Cancel it and propose it again.`;

	return `This transaction can only execute until the end of epoch ${lastEpoch}, around ${formatDateTime(endsAt)}. After that, it has to be proposed again.`;
}

// The current time, updated every minute.
function useNow() {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const interval = setInterval(
			() => setNow(new Date()),
			60_000,
		);
		return () => clearInterval(interval);
	}, []);
	return now;
}
