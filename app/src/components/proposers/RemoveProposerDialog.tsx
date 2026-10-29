// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useRef } from 'react';

import { useRemoveProposer } from '../../hooks/useRemoveProposer';
import { ShortAddress } from '../invitations/ShortAddress';
import { Button } from '../ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from '../ui/dialog';

/**
 * Asks before removing an external proposer, then signs the removal with
 * the wallet. It can't close while the wallet is asked.
 */
export function RemoveProposerDialog({
	open,
	onOpenChange,
	multisigAddress,
	accountName,
	proposerAddress,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	multisigAddress: string;
	/** What to call the account in the description. */
	accountName: string;
	proposerAddress: string | null;
}) {
	const removeProposer = useRemoveProposer(
		multisigAddress,
		{
			onSuccess: () => {
				onOpenChange(false);
			},
		},
	);
	const pending = removeProposer.isPending;
	const cancelRef = useRef<HTMLButtonElement>(null);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// Closing mid-sign would reset the request and allow a second one.
				if (!next && !pending) onOpenChange(false);
			}}
		>
			<DialogContent
				showCloseButton={false}
				className="gap-0 p-6 sm:max-w-[420px]"
				data-testid="remove-proposer-confirm"
				data-address={proposerAddress ?? undefined}
				// Not the address before it, whose tooltip opens on focus.
				initialFocus={cancelRef}
			>
				<DialogTitle className="text-20 font-bold">
					Remove external proposer?
				</DialogTitle>
				<DialogDescription className="mt-2 text-14 text-muted-foreground">
					{proposerAddress && (
						<ShortAddress
							address={proposerAddress}
							className="font-mono text-foreground"
						/>
					)}{' '}
					won’t be able to create proposals for{' '}
					{accountName} anymore.
				</DialogDescription>
				<div className="mt-5 grid grid-cols-2 gap-2">
					<Button
						ref={cancelRef}
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={pending}
					>
						Cancel
					</Button>
					<Button
						variant="outlineDestructive"
						onClick={() => {
							if (proposerAddress)
								removeProposer.mutate(proposerAddress);
						}}
						disabled={pending}
					>
						{pending ? 'Confirm in your wallet…' : 'Remove'}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
