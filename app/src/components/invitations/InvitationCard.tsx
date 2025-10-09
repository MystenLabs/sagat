import { formatAddress } from '@mysten/sui/utils';
import {
	ChevronDown,
	ChevronRight,
	Users,
} from 'lucide-react';
import { useState } from 'react';

import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { useAcceptInvitation } from '../../hooks/useAcceptInvitation';
import { useRejectInvitation } from '../../hooks/useRejectInvitation';
import { Button } from '../ui/button';
import { CopyButton } from '../ui/CopyButton';
import { InvitationDetails } from './InvitationDetails';

interface InvitationCardProps {
	multisig: MultisigWithMembersForPublicKey;
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
		<div className="bg-white border rounded-lg hover:shadow-sm transition-shadow">
			{/* Main invitation row */}
			<div className="flex items-center justify-between p-4">
				{/* Left side - Multisig info */}
				<div className="flex items-center space-x-4 flex-1">
					<div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
						<Users className="w-5 h-5 text-blue-600" />
					</div>
					<div className="flex-1">
						<h3 className="font-medium text-gray-900">
							{multisig.name ||
								formatAddress(multisig?.address)}
						</h3>
						<div className="flex items-center gap-1">
							<p className="text-sm text-gray-500">
								{formatAddress(multisig.address)}
							</p>
							<CopyButton
								value={multisig.address}
								size="xs"
							/>
						</div>
						<p className="text-xs text-gray-400">
							{`${multisig.totalMembers - multisig.pendingMembers - multisig.rejectedMembers} out of ${multisig.totalMembers} members accepted`}
						</p>
					</div>
				</div>

				{/* Right side - More info button */}
				<div className="flex items-center">
					<Button
						variant="outline"
						size="sm"
						onClick={toggleExpanded}
						className="text-blue-600 hover:text-blue-700 hover:border-blue-200"
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
