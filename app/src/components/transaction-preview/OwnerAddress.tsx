// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';

import { ShortAddress } from '../invitations/ShortAddress';

type OwnerDisplay =
	string | { address: string } | { object: string };

const getOwnerDisplay = (
	owner: SuiClientTypes.ObjectOwner,
): OwnerDisplay => {
	switch (owner.$kind) {
		case 'Immutable':
			return 'Immutable';
		case 'Shared':
			return 'Shared';
		case 'AddressOwner':
			return { address: owner.AddressOwner };
		case 'ObjectOwner':
			return { object: owner.ObjectOwner };
		case 'ConsensusAddressOwner':
			return { object: owner.ConsensusAddressOwner?.owner };
		case 'Unknown':
			return 'Unknown Owner';
		default:
			return 'Failed to find or parse owner.';
	}
};

/**
 * An object's owner in the preview's cells. Address and object owners
 * show like every other address: short, with the full value and a copy
 * button on hover or focus. The sender shows as "Sender"; owners without
 * an address (immutable, shared) as plain text.
 */
export function OwnerAddress({
	owner,
	senderAddress,
}: {
	owner: SuiClientTypes.ObjectOwner;
	senderAddress?: string;
}) {
	const ownerDisplay = getOwnerDisplay(owner);

	if (typeof ownerDisplay === 'string') {
		return <span>{ownerDisplay}</span>;
	}

	const ownerAddress =
		'address' in ownerDisplay
			? ownerDisplay.address
			: undefined;
	const id =
		ownerAddress ??
		('object' in ownerDisplay
			? ownerDisplay.object
			: undefined);

	if (!id) return <span>-</span>;

	const isSender =
		!!ownerAddress &&
		!!senderAddress &&
		isSameAddress(ownerAddress, senderAddress);

	return (
		<ShortAddress address={id}>
			{isSender ? 'Sender' : undefined}
		</ShortAddress>
	);
}

function isSameAddress(a: string, b: string): boolean {
	try {
		return (
			normalizeSuiAddress(a) === normalizeSuiAddress(b)
		);
	} catch {
		return false;
	}
}
