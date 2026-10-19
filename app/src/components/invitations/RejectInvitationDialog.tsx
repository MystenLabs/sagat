// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { errorMessage } from '@/lib/utils';

import { Alert } from '../ui/Alert';
import { Button } from '../ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from '../ui/dialog';

/**
 * Rejecting is a signed action, so it asks first, then signs with the
 * wallet right away. A failure stays in the dialog with a way back.
 */
export function RejectInvitationDialog({
	open,
	onClose,
	name,
	onConfirm,
	rejecting,
	error,
	onBack,
}: {
	open: boolean;
	onClose: () => void;
	name: string;
	onConfirm: () => void;
	rejecting: boolean;
	error: unknown;
	onBack: () => void;
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
				data-state-kind={error ? 'failed' : 'confirm'}
			>
				{error ? (
					<>
						<DialogTitle className="text-16 font-semibold">
							Couldn't reject the invitation
						</DialogTitle>
						<DialogDescription className="mt-2 text-13 text-muted-foreground">
							Nothing changed: the invitation is still
							pending.
						</DialogDescription>
						<Alert
							variant="error"
							className="mt-4"
							data-testid="reject-invitation-error"
						>
							{errorMessage(
								error,
								'The wallet rejected the request.',
							)}
						</Alert>
						<div className="mt-5 grid grid-cols-2 gap-2">
							<Button variant="outline" onClick={onBack}>
								Go back
							</Button>
							<Button
								variant="outlineDestructive"
								onClick={onConfirm}
								disabled={rejecting}
								data-testid="reject-invitation-button"
							>
								Try again
							</Button>
						</div>
					</>
				) : (
					<>
						<DialogTitle className="text-16 font-semibold">
							Reject this invitation?
						</DialogTitle>
						<DialogDescription className="mt-2 text-13 text-muted-foreground">
							You won't join {name}, and its creator will
							see that you rejected the invitation.
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
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
