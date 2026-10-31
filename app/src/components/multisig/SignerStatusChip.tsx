// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Chip } from '@/components/ui/chip';
import { content } from '@/content';
import { type SignerEntry } from '@/lib/signers';

const COPY = content.signers.status;

const STATUS_CHIP = {
	accepted: {
		variant: 'success',
		label: COPY.accepted,
	},
	rejected: {
		variant: 'error',
		label: COPY.rejected,
	},
	pending: {
		variant: 'warning',
		label: COPY.pending,
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
