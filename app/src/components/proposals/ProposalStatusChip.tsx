// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ProposalStatusKey } from '@/lib/proposalUtils';

import { Chip, type ChipProps } from '../ui/chip';

const STATUS_CHIP = {
	executed: { variant: 'success', label: 'Executed' },
	cancelled: { variant: 'neutral', label: 'Cancelled' },
	failed: { variant: 'error', label: 'Failed' },
	ready: { variant: 'info', label: 'Ready' },
	pending: { variant: 'warning', label: 'Pending' },
	expired: { variant: 'neutral', label: 'Expired' },
} as const satisfies Record<
	ProposalStatusKey,
	{ variant: ChipProps['variant']; label: string }
>;

/** The chip for where a proposal stands. */
export function ProposalStatusChip({
	status,
	...props
}: { status: ProposalStatusKey } & Omit<
	ChipProps,
	'variant' | 'children'
>) {
	const { variant, label } = STATUS_CHIP[status];
	return (
		<Chip variant={variant} {...props}>
			{label}
		</Chip>
	);
}
