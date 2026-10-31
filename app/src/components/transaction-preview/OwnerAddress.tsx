// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';

import { ShortAddress } from '../invitations/ShortAddress';

/**
 * An object's owner in the preview's cells. Address, object and
 * consensus owners show like every other address: short, with the full
 * value and a copy button on hover or focus. An address owner that is
 * the sender shows as "Sender"; owners without an address (immutable,
 * shared) as plain text.
 */
export function OwnerAddress({
	owner,
	senderAddress,
}: {
	owner: SuiClientTypes.ObjectOwner;
	senderAddress?: string;
}) {
	switch (owner.$kind) {
		case 'AddressOwner': {
			const isSender =
				!!senderAddress &&
				isSameAddress(owner.AddressOwner, senderAddress);
			return (
				<ShortAddress address={owner.AddressOwner}>
					{isSender ? 'Sender' : undefined}
				</ShortAddress>
			);
		}
		case 'ObjectOwner':
			return <ShortAddress address={owner.ObjectOwner} />;
		case 'ConsensusAddressOwner': {
			const address = owner.ConsensusAddressOwner?.owner;
			return address ? (
				<ShortAddress address={address} />
			) : (
				<span>-</span>
			);
		}
		case 'Immutable':
			return <span>Immutable</span>;
		case 'Shared':
			return <span>Shared</span>;
		case 'Unknown':
			return <span>Unknown Owner</span>;
		default:
			return <span>Failed to find or parse owner.</span>;
	}
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
