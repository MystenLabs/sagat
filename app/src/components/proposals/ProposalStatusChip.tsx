// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '@/content';
import { type ProposalStatusKey } from '@/lib/proposalUtils';

import { Chip, type ChipProps } from '../ui/chip';

const STATUS = content.proposals.status;

const STATUS_CHIP = {
	executed: { variant: 'success', label: STATUS.executed },
	cancelled: {
		variant: 'neutral',
		label: STATUS.cancelled,
	},
	failed: { variant: 'error', label: STATUS.failed },
	ready: { variant: 'info', label: STATUS.ready },
	pending: { variant: 'warning', label: STATUS.pending },
	expired: { variant: 'neutral', label: STATUS.expired },
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
