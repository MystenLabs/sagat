// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Check, Users, X } from 'lucide-react';

import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { Button } from '../ui/button';
import { MembersList } from './MembersList';

interface InvitationDetailsProps {
	multisig: MultisigWithMembersForPublicKey;
	onAccept: () => void;
	onReject: () => void;
	isProcessing: boolean;
}

export function InvitationDetails({
	multisig,
	onAccept,
	onReject,
	isProcessing,
}: InvitationDetailsProps) {
	return (
		<div className="border-t bg-surface p-4">
			<div className="flex items-center justify-between mb-3">
				<h4 className="font-medium text-foreground flex items-center">
					<Users className="w-4 h-4 mr-2" />
					Members ({multisig.totalMembers})
				</h4>

				<p className="text-sm text-muted-foreground">
					{
						multisig.members.filter((m) => m.isAccepted)
							.length
					}{' '}
					of {multisig.members.length} accepted
				</p>
			</div>

			<div className="space-y-2">
				<MembersList members={multisig.members} />

				{/* Actions inside expanded section */}
				<div className="flex items-center justify-end space-x-2 mt-4 pt-4 border-t">
					{!multisig.isRejected && (
						<Button
							variant="outline"
							size="sm"
							onClick={onReject}
							disabled={isProcessing}
							className="text-error-foreground hover:text-error-foreground hover:border-error-border"
						>
							<X className="w-4 h-4 mr-1" />
							Reject Invitation
						</Button>
					)}
					<Button
						size="sm"
						onClick={onAccept}
						disabled={isProcessing}
					>
						{isProcessing ? (
							<>
								<div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2" />
								Accepting...
							</>
						) : (
							<>
								<Check className="w-4 h-4 mr-1" />
								Accept Invitation
							</>
						)}
					</Button>
				</div>
			</div>
		</div>
	);
}
