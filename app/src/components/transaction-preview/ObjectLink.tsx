// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentNetwork } from '@mysten/dapp-kit-react';
import type { SuiClientTypes } from '@mysten/sui/client';
import {
	formatAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';

import { content } from '@/content';
import { toast } from '@/lib/toast';
import { getExplorerUrl } from '@/lib/utils';

const COPY = content.transactionPreview.owner;

type OwnerDisplay =
	string | { address: string } | { object: string };

const getOwnerDisplay = (
	owner: SuiClientTypes.ObjectOwner,
): OwnerDisplay => {
	switch (owner.$kind) {
		case 'Immutable':
			return COPY.immutable;
		case 'Shared':
			return COPY.shared;
		case 'AddressOwner':
			return { address: owner.AddressOwner };
		case 'ObjectOwner':
			return { object: owner.ObjectOwner };
		case 'ConsensusAddressOwner':
			return { object: owner.ConsensusAddressOwner?.owner };
		case 'Unknown':
			return COPY.unknown;
		default:
			return COPY.parseFailed;
	}
};

export function ObjectLink({
	owner,
	object,
	inputObject,
	senderAddress,
	...tags
}: {
	inputObject?: string;
	owner?: SuiClientTypes.ObjectOwner;
	object?: SuiClientTypes.ChangedObject;
	senderAddress?: string;
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

	if (inputObject) {
		objectId = inputObject;
		display = formatAddress(inputObject);
	}

	if (object) {
		objectId = object.objectId;
		display = formatAddress(objectId);
	}

	if (
		objectId &&
		senderAddress &&
		ownerDisplay &&
		typeof ownerDisplay !== 'string' &&
		'address' in ownerDisplay &&
		isSameAddress(objectId, senderAddress)
	) {
		display = COPY.sender;
	}

	const link = objectId
		? getExplorerUrl(
				objectId,
				network,
				ownerDisplay ? 'account' : 'object',
			)
		: null;

	const copy = () => {
		if (!objectId && !display) return;

		navigator.clipboard.writeText(
			objectId || display || '',
		);
		setCopied(true);
		toast.copied();

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

function isSameAddress(a: string, b: string): boolean {
	try {
		return (
			normalizeSuiAddress(a) === normalizeSuiAddress(b)
		);
	} catch {
		return false;
	}
}
