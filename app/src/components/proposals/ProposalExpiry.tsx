// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from 'react';

import { formatDateTime } from '@/lib/dates';

import { useEpochInfo } from '../../hooks/useEpochInfo';
import {
	formatTimeLeft,
	getExpiry,
	type Expiry,
} from '../../lib/expiration';
import { Chip } from '../ui/chip';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../ui/tooltip';

// A badge with how long a proposal's transaction can still execute, if it
// expires at all.
export function ProposalExpiry({
	transactionBytes,
}: {
	transactionBytes: string;
}) {
	const { data: epochInfo } = useEpochInfo();
	const now = useNow();
	const expiry = useMemo(
		() =>
			epochInfo
				? getExpiry(transactionBytes, epochInfo)
				: null,
		[transactionBytes, epochInfo],
	);
	if (!expiry) return null;

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
					{expiry.expired
						? 'Expired'
						: `Expires in ${formatTimeLeft(expiry.endsAt, now)}`}
				</TooltipTrigger>
				<TooltipContent className="max-w-xs">
					{explain(expiry)}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
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
