// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useEffect,
	useState,
	type ReactElement,
} from 'react';

import { content } from '@/content';
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
	return (
		<ExpiryTooltip
			expiry={expiry}
			trigger={
				<Chip
					variant={expiry.expired ? 'error' : 'neutral'}
					data-testid="proposal-expiry"
					tabIndex={0}
				/>
			}
		/>
	);
}

function InlineExpiry({ expiry }: { expiry: Expiry }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span aria-hidden>·</span>
			<ExpiryTooltip
				expiry={expiry}
				trigger={(now) => (
					<span
						className={cn(
							'whitespace-nowrap',
							expiry.expired
								? 'text-error-foreground'
								: expiresSoon(expiry.endsAt, now) &&
										'text-warning-foreground',
						)}
						data-testid="proposal-expiry"
						tabIndex={0}
					/>
				)}
			/>
		</span>
	);
}

// The expiry's label on `trigger`, with the explanation in a tooltip.
// `trigger` can take the current time, to style itself by it.
function ExpiryTooltip({
	expiry,
	trigger,
}: {
	expiry: Expiry;
	trigger: ReactElement | ((now: Date) => ReactElement);
}) {
	const now = useNow();
	return (
		<TooltipProvider delay={150}>
			<Tooltip>
				<TooltipTrigger
					render={
						typeof trigger === 'function'
							? trigger(now)
							: trigger
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

function label({ expired, endsAt }: Expiry, now: Date) {
	return expired
		? content.proposals.expiry.expired
		: content.proposals.expiry.expiresIn(
				formatTimeLeft(endsAt, now),
			);
}

function explain({ lastEpoch, expired, endsAt }: Expiry) {
	if (expired)
		return content.proposals.expiry.expiredExplain(
			lastEpoch,
		);

	return content.proposals.expiry.explain(
		lastEpoch,
		formatDateTime(endsAt),
	);
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
