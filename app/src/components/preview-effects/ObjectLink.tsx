// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentNetwork } from '@mysten/dapp-kit-react';
import type { SuiClientTypes } from '@mysten/sui/client';
import { formatAddress } from '@mysten/sui/utils';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type OwnerDisplay =
	| string
	| { address: string }
	| { object: string };

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

export function ObjectLink({
	owner,
	type,
	object,
	inputObject,
	...tags
}: {
	inputObject?: string;
	type?: string;
	owner?: SuiClientTypes.ObjectOwner;
	object?: SuiClientTypes.ChangedObject;
} & React.HTMLAttributes<HTMLAnchorElement> &
	React.ComponentPropsWithoutRef<'a'>) {
	const [copied, setCopied] = useState(false);

	const network = useCurrentNetwork();

	let objectId: string | undefined;
	let display: string | undefined;

	const ownerDisplay = owner
		? getOwnerDisplay(owner)
		: undefined;

	if (ownerDisplay) {
		if (typeof ownerDisplay !== 'string') {
			objectId =
				'address' in ownerDisplay
					? ownerDisplay.address
					: ownerDisplay.object;
			display = formatAddress(objectId);
		} else {
			display = ownerDisplay;
		}
	}

	if (type) {
		display = type;
	}

	if (inputObject) {
		objectId = inputObject;
		display = formatAddress(inputObject);
	}

	if (object) {

		objectId = object.objectId;
		display = formatAddress(objectId);
	}

	const link = objectId
		? `https://suiexplorer.com/${ownerDisplay ? 'address' : 'object'}/${objectId}?network=${
				network.split(':')[1]
			}`
		: undefined;

	const copy = () => {
		if (!objectId && !display) return;

		navigator.clipboard.writeText(
			objectId || display || '',
		);
		setCopied(true);
		toast.success('Copied to clipboard!');

		setTimeout(() => {
			setCopied(false);
		}, 1_000);
	};

	return (
		<>
			{copied ? (
				<CheckIcon width={10} height={10} className="" />
			) : display ? (
				<CopyIcon
					width={10}
					height={10}
					className="cursor-pointer"
					onClick={copy}
				/>
			) : null}

			{link ? (
				<>
					<a
						href={link}
						target="_blank"
						className="underline wrap-break-word pl-2"
						{...tags}
						rel="noreferrer"
					>
						{display}
					</a>
				</>
			) : (
				<span>{display || '-'}</span>
			)}
		</>
	);
}
