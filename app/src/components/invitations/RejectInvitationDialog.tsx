// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Button } from '../ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from '../ui/dialog';

/** Rejecting is a signed action, so it asks first. */
export function RejectInvitationDialog({
	open,
	onClose,
	name,
	onConfirm,
	rejecting,
}: {
	open: boolean;
	onClose: () => void;
	name: string;
	onConfirm: () => void;
	rejecting: boolean;
}) {
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				showCloseButton={false}
				className="gap-0 p-6 sm:max-w-[420px]"
				data-testid="invitation-reject-confirm"
			>
				<DialogTitle className="text-16 font-semibold">
					Reject this invitation?
				</DialogTitle>
				<DialogDescription className="mt-2 text-13 text-muted-foreground">
					You won't join {name}, and the invitation moves to
					the Rejected tab.
				</DialogDescription>
				<div className="mt-5 grid grid-cols-2 gap-2">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={rejecting}
					>
						Go back
					</Button>
					<Button
						variant="outlineDestructive"
						onClick={onConfirm}
						disabled={rejecting}
						data-testid="reject-invitation-button"
					>
						{rejecting
							? 'Confirm in your wallet…'
							: 'Reject invitation'}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
