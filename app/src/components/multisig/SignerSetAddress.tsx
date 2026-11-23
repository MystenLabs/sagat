// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { content } from '@/content';
import { cn } from '@/lib/utils';

import { buttonVariants } from '../ui/button';
import { CopyButton } from '../ui/CopyButton';

/** A signer set's address, whole, with a copy button. */
export function SignerSetAddress({
	address,
}: {
	address: string;
}) {
	return (
		<span className="flex min-w-0 items-center gap-1">
			<span
				className="min-w-0 font-mono text-12 break-all"
				data-testid="signer-set-address"
			>
				{address}
			</span>
			<CopyButton
				value={address}
				size="inline"
				successMessage={content.toasts.addressCopied}
			/>
		</span>
	);
}

/** "Open pod", to a pod of the viewer's list. */
export function OpenPodLink({
	address,
}: {
	address: string;
}) {
	return (
		<Link
			to={`/multisig/${address}/overview`}
			className={cn(
				buttonVariants({ variant: 'ghost', size: 'sm' }),
				'gap-1 -mr-2.5',
			)}
			data-testid="open-pod-link"
		>
			{content.signers.openPod}
			<ChevronRight className="size-3" />
		</Link>
	);
}
