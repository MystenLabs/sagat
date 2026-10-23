// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Chip } from '@/components/ui/chip';
import { type SignerEntry } from '@/lib/signers';

const STATUS_CHIP = {
	accepted: { variant: 'success', label: 'Accepted' },
	rejected: { variant: 'error', label: 'Rejected' },
	pending: { variant: 'warning', label: 'Invited' },
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
