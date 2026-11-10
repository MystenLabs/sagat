// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Users } from 'lucide-react';
import { useState } from 'react';

import { content } from '@/content';
import {
	accountCreator,
	accountName,
} from '@/lib/account-name';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { useAcceptInvitation } from '../../hooks/useAcceptInvitation';
import { useRejectInvitation } from '../../hooks/useRejectInvitation';
import { SignerStatusChip } from '../multisig/SignerStatusChip';
import { Button } from '../ui/button';
import { CopyButton } from '../ui/CopyButton';
import { RejectInvitationDialog } from './RejectInvitationDialog';
import { ReviewInvitationDialog } from './ReviewInvitationDialog';
import { ShortAddress } from './ShortAddress';

const COPY = content.invitations.card;

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
	const creator = accountCreator(multisig);

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

	// Back from a failed reject returns to the invitation, as its copy says.
	const closeReject = () => {
		setRejecting(false);
		reject.reset();
	};

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
							{multisig.name ? (
								name
							) : (
								<ShortAddress address={multisig.address}>
									{name}
								</ShortAddress>
							)}
						</h3>
						<SignerStatusChip
							status={
								multisig.isRejected ? 'rejected' : 'pending'
							}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-13 text-muted-foreground">
						<span data-testid="invitation-invited-by">
							{creator?.label
								? COPY.invitedByName(creator.label)
								: COPY.invitedBy}
						</span>
						<span className="flex items-center gap-1 font-mono text-12 text-foreground-secondary">
							{creator ? (
								<ShortAddress address={creator.address} />
							) : (
								COPY.unknownKey
							)}
							{creator && (
								<CopyButton
									value={creator.address}
									size="xs"
									successMessage={
										content.toasts.addressCopied
									}
								/>
							)}
						</span>
					</div>
				</div>
			</div>

			{multisig.isRejected ? (
				<p className="shrink-0 text-13 text-muted-foreground">
					{COPY.rejectedNote}
				</p>
			) : (
				<div className="flex shrink-0 gap-2 max-md:justify-end">
					<Button
						variant="outline"
						onClick={() => setRejecting(true)}
						disabled={busy}
						data-testid="reject-invitation-open"
					>
						{content.common.actions.reject}
					</Button>
					<Button
						onClick={() => setReviewing(true)}
						disabled={busy}
						data-testid="invitation-toggle-details"
					>
						{COPY.review}
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
				onClose={closeReject}
				name={name}
				creatorName={creator?.label ?? null}
				onConfirm={handleReject}
				rejecting={reject.isPending}
				error={reject.error}
				onBack={closeReject}
			/>
		</div>
	);
}
