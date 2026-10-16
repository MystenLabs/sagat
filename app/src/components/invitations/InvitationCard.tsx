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
import { accountName } from './account-name';
import { RejectInvitationDialog } from './RejectInvitationDialog';
import { ReviewInvitationDialog } from './ReviewInvitationDialog';

/**
 * One invitation in the inbox: the account, who has accepted so far, and
 * the way in. Reviewing opens the signer set; rejecting asks first.
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

	const accepted = multisig.members.filter(
		(m) => m.isAccepted,
	).length;
	const name = accountName(multisig);

	const handleAccept = () =>
		accept.mutate(
			{ address: multisig.address, name: multisig.name },
			{ onSuccess: () => setReviewing(false) },
		);
	const handleReject = () =>
		reject.mutate(
			{ address: multisig.address, name: multisig.name },
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
						<span>
							Threshold {multisig.threshold} of{' '}
							{multisig.totalWeight}
						</span>
						<span aria-hidden>·</span>
						<span>
							{accepted} of {multisig.totalMembers} accepted
						</span>
						<span aria-hidden>·</span>
						<span className="flex items-center gap-1 font-mono text-12 text-foreground-secondary">
							{formatAddress(multisig.address)}
							<CopyButton
								value={multisig.address}
								size="xs"
								successMessage="Address copied"
							/>
						</span>
					</div>
				</div>
			</div>

			{!multisig.isRejected && (
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
				onClose={() => setReviewing(false)}
				multisig={multisig}
				onAccept={handleAccept}
				onReject={() => setRejecting(true)}
				accepting={accept.isPending}
			/>
			<RejectInvitationDialog
				open={rejecting}
				onClose={() => setRejecting(false)}
				name={name}
				onConfirm={handleReject}
				rejecting={reject.isPending}
			/>
		</div>
	);
}
