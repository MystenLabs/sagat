// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '@/content';
import { errorMessage } from '@/lib/utils';

import { Alert } from '../ui/Alert';
import { Button } from '../ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from '../ui/dialog';

const ACTIONS = content.common.actions;
const COPY = content.invitations;

/**
 * Rejecting is a signed action, so it asks first, then signs with the
 * wallet right away. A failure stays in the dialog with a way back.
 */
export function RejectInvitationDialog({
	open,
	onClose,
	name,
	creatorName,
	onConfirm,
	rejecting,
	error,
	onBack,
}: {
	open: boolean;
	onClose: () => void;
	name: string;
	/** The creator's name, when the invitation has one. */
	creatorName: string | null;
	onConfirm: () => void;
	rejecting: boolean;
	error: unknown;
	onBack: () => void;
}) {
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// Closing mid-sign would reset the request and allow a second one.
				if (!next && !rejecting) onClose();
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
							{COPY.rejectDialog.failedTitle}
						</DialogTitle>
						<DialogDescription className="mt-2 text-13 text-muted-foreground">
							{COPY.rejectDialog.failedDescription}
						</DialogDescription>
						<Alert
							variant="error"
							className="mt-4"
							data-testid="reject-invitation-error"
						>
							{errorMessage(error, COPY.walletRejected)}
						</Alert>
						<div className="mt-5 grid grid-cols-2 gap-2">
							<Button variant="outline" onClick={onBack}>
								{ACTIONS.goBack}
							</Button>
							<Button
								variant="outlineDestructive"
								onClick={onConfirm}
								disabled={rejecting}
								data-testid="reject-invitation-button"
							>
								{ACTIONS.tryAgain}
							</Button>
						</div>
					</>
				) : (
					<>
						<DialogTitle className="text-16 font-semibold">
							{COPY.rejectDialog.title}
						</DialogTitle>
						<DialogDescription className="mt-2 text-13 text-muted-foreground">
							{COPY.rejectDialog.description(
								name,
								creatorName,
							)}
						</DialogDescription>
						<div className="mt-5 grid grid-cols-2 gap-2">
							<Button
								variant="outline"
								onClick={onClose}
								disabled={rejecting}
							>
								{ACTIONS.goBack}
							</Button>
							<Button
								variant="outlineDestructive"
								onClick={onConfirm}
								disabled={rejecting}
								data-testid="reject-invitation-button"
							>
								{rejecting
									? content.common.states.confirmInWallet
									: COPY.rejectDialog.confirm}
							</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
