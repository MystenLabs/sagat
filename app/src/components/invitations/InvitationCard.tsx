// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import {
	ChevronDown,
	ChevronRight,
	Users,
} from 'lucide-react';
import { useState } from 'react';

import { type InvitationForPublicKey } from '@/lib/types';

import { useAcceptInvitation } from '../../hooks/useAcceptInvitation';
import { useRejectInvitation } from '../../hooks/useRejectInvitation';
import { Button } from '../ui/button';
import { CopyButton } from '../ui/CopyButton';
import { InvitationDetails } from './InvitationDetails';

interface InvitationCardProps {
	multisig: InvitationForPublicKey;
}

export function InvitationCard({
	multisig,
}: InvitationCardProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [processingInvite, setProcessingInvite] =
		useState(false);
	const acceptInvitation = useAcceptInvitation();
	const rejectInvitation = useRejectInvitation();

	const toggleExpanded = async () => {
		setIsExpanded(!isExpanded);
	};

	const handleAccept = () => {
		setProcessingInvite(true);
		acceptInvitation.mutate(multisig.address, {
			onSettled: () => setProcessingInvite(false),
		});
	};

	const handleReject = () => {
		setProcessingInvite(true);
		rejectInvitation.mutate(multisig.address, {
			onSettled: () => setProcessingInvite(false),
		});
	};

	return (
		<div
			className="bg-card border rounded-lg hover:shadow-sm transition-shadow"
			data-testid="invitation-card"
			data-multisig-address={multisig.address}
			data-account-address={multisig.accountAddress}
		>
			{/* Main invitation row */}
			<div className="flex items-center justify-between p-4">
				{/* Left side - Multisig info */}
				<div className="flex items-center space-x-4 flex-1">
					<div className="w-10 h-10 bg-info-soft rounded-full flex items-center justify-center">
						<Users className="w-5 h-5 text-info-foreground" />
					</div>
					<div className="flex-1">
						{/* The invitation is to sign for an account, with the
						signer set it is drafted for underneath. An account
						labels its original set with its own name, so the
						label is only repeated when it differs. */}
						<h3
							className="font-medium text-foreground"
							data-testid="invitation-account-name"
						>
							{multisig.accountName ||
								formatAddress(multisig.accountAddress)}
						</h3>
						<div className="flex items-center gap-1">
							<p className="text-sm text-muted-foreground">
								{multisig.label &&
								multisig.label !== multisig.accountName
									? `${multisig.label} • `
									: ''}
								{formatAddress(multisig.address)}
							</p>
							<CopyButton
								value={multisig.address}
								size="xs"
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							{`${multisig.members.length - multisig.pendingMembers - multisig.rejectedMembers} out of ${multisig.members.length} members accepted`}
						</p>
					</div>
				</div>

				{/* Right side - More info button */}
				<div className="flex items-center">
					<Button
						variant="outline"
						size="sm"
						onClick={toggleExpanded}
						className="text-info-foreground hover:border-info-border"
						data-testid="invitation-toggle-details"
					>
						{isExpanded ? (
							<>
								<ChevronDown className="w-4 h-4 mr-1" />
								Hide Details
							</>
						) : (
							<>
								<ChevronRight className="w-4 h-4 mr-1" />
								More Information
							</>
						)}
					</Button>
				</div>
			</div>

			{/* Expandable member details */}
			{isExpanded && (
				<InvitationDetails
					multisig={multisig}
					onAccept={handleAccept}
					onReject={handleReject}
					isProcessing={processingInvite}
				/>
			)}
		</div>
	);
}
