// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { formatLongAddress } from '@/lib/sui-utils';

/** An address or object ID with ten characters on each side. */
export function LongAddress({
	address,
	className,
}: {
	address: string;
	className?: string;
}) {
	return (
		<ShortAddress address={address} className={className}>
			{formatLongAddress(address)}
		</ShortAddress>
	);
}
