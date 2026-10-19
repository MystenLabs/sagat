// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import { Users } from 'lucide-react';
import { useState } from 'react';

import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { useAcceptInvitation } from '../../hooks/useAcceptInvitation';
import { useRejectInvitation } from '../../hooks/useRejectInvitation';
import { Button } from '../ui/button';
import { Chip } from '../ui/chip';
import { CopyButton } from '../ui/CopyButton';
import {
	accountName,
	creatorAddress,
} from './account-name';
import { RejectInvitationDialog } from './RejectInvitationDialog';
import { ReviewInvitationDialog } from './ReviewInvitationDialog';

/**
 * One invitation in the inbox: the account, who sent it, and the way in.
 * Reviewing opens the signer set; rejecting asks first. Both sign with
 * the wallet straight away and show what happened in their dialog.
 */
export function InvitationCard({
	multisig,
}: {
	multisig: MultisigWithMembersForPublicKey;
}) {
	const [reviewing, setReviewing] = useState(false);
	const [rejecting, setRejecting] = useState(false);
	const accept = useAcceptInvitation();
	const reject = useRejectInvitation();
	const busy = accept.isPending || reject.isPending;

	const name = accountName(multisig);
	const creator = creatorAddress(multisig);

	// On success the hook moves to the account page itself.
	const handleAccept = () =>
		accept.mutate({ address: multisig.address });
	const handleReject = () =>
		reject.mutate(
			{ address: multisig.address },
			{
				onSuccess: () => {
					setRejecting(false);
					setReviewing(false);
				},
			},
		);

	return (
		<div
			className="flex flex-col gap-4 rounded-xl border bg-card p-5 md:flex-row md:items-center md:p-7"
			data-testid="invitation-card"
			data-multisig-address={multisig.address}
		>
			<div className="flex min-w-0 flex-1 items-center gap-4">
				<div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
					<Users className="size-5" />
				</div>
				<div className="flex min-w-0 flex-col gap-1">
					<div className="flex items-center gap-2.5">
						<h3 className="truncate text-16 font-medium">
							{name}
						</h3>
						{multisig.isRejected ? (
							<Chip variant="error">Rejected</Chip>
						) : (
							<Chip variant="warning">Invited</Chip>
						)}
					</div>
					<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-13 text-muted-foreground">
						<span>Invited by</span>
						<span className="flex items-center gap-1 font-mono text-12 text-foreground-secondary">
							{creator
								? formatAddress(creator)
								: 'an unknown key'}
							{creator && (
								<CopyButton
									value={creator}
									size="xs"
									successMessage="Address copied"
								/>
							)}
						</span>
					</div>
				</div>
			</div>

			{multisig.isRejected ? (
				<p className="shrink-0 text-13 text-muted-foreground">
					You rejected this invitation.
				</p>
			) : (
				<div className="flex shrink-0 gap-2 max-md:justify-end">
					<Button
						variant="outline"
						onClick={() => setRejecting(true)}
						disabled={busy}
						data-testid="reject-invitation-open"
					>
						Reject
					</Button>
					<Button
						onClick={() => setReviewing(true)}
						disabled={busy}
						data-testid="invitation-toggle-details"
					>
						Review invitation
					</Button>
				</div>
			)}

			<ReviewInvitationDialog
				open={reviewing}
				onClose={() => {
					setReviewing(false);
					accept.reset();
				}}
				multisig={multisig}
				creator={creator}
				onAccept={handleAccept}
				onReject={() => setRejecting(true)}
				accepting={accept.isPending}
				error={accept.error}
				onBack={() => accept.reset()}
			/>
			<RejectInvitationDialog
				open={rejecting}
				onClose={() => {
					setRejecting(false);
					reject.reset();
				}}
				name={name}
				onConfirm={handleReject}
				rejecting={reject.isPending}
				error={reject.error}
				onBack={() => reject.reset()}
			/>
		</div>
	);
}
