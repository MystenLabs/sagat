// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Chip } from '@/components/ui/chip';
import { content } from '@/content';
import { type SignerEntry } from '@/lib/signers';

const STATUS_CHIP = {
	accepted: {
		variant: 'success',
		label: content.signers.status.accepted,
	},
	rejected: {
		variant: 'error',
		label: content.signers.status.rejected,
	},
	pending: {
		variant: 'warning',
		label: content.signers.status.pending,
	},
} as const;

/** Where a signer's invitation stands, as a status chip. */
export function SignerStatusChip({
	status,
}: {
	status: SignerEntry['status'];
}) {
	const { variant, label } = STATUS_CHIP[status];
	return <Chip variant={variant}>{label}</Chip>;
}
