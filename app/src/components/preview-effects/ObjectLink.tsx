// Copyright (c) Mysten Labs, Inc.
// Modifications Copyright (c) 2025 IOTA Stiftung
// SPDX-License-Identifier: Apache-2.0

import { useIotaClientContext } from '@iota/dapp-kit';
import {
	type ObjectOwner,
	type IotaObjectChange,
} from '@iota/iota-sdk/client';
import { formatAddress } from '@iota/iota-sdk/utils';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type OwnerDisplay =
	| string
	| { address: string }
	| { object: string };

const getOwnerDisplay = (
	owner: ObjectOwner,
): OwnerDisplay => {
	if (owner === 'Immutable') return 'Immutable';
	if ('Shared' in owner) return 'Shared';
	if ('AddressOwner' in owner)
		return { address: owner.AddressOwner };
	// if ('ObjectOwner' in owner)
		return { object: owner.ObjectOwner };
	// TODO: ConsensusAddressOwner doesn't exist yet in the SDK
	// return { object: owner.ConsensusAddressOwner.owner };
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
	owner?: ObjectOwner;
	object?: IotaObjectChange;
} & React.HTMLAttributes<HTMLAnchorElement> &
	React.ComponentPropsWithoutRef<'a'>) {
	const [copied, setCopied] = useState(false);

	const { network } = useIotaClientContext();

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
		if ('objectId' in object) {
			objectId = object.objectId;
			display = formatAddress(objectId);
		}

		if ('packageId' in object) {
			objectId = object.packageId;
			display = formatAddress(objectId);
		}
	}

	const link = objectId
		? `https://explorer.iota.org/${ownerDisplay ? 'address' : 'object'}/${objectId}?network=${
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
						className="underline break-words pl-2"
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
