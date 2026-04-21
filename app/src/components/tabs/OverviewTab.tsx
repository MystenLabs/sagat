// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	Check,
	Copy,
	ExternalLink,
	Users,
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';

import { useGetMultisig } from '@/hooks/useGetMultisig';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { useNetwork } from '../../contexts/NetworkContext';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { CONFIG } from '../../lib/constants';
import { MembersList } from '../invitations/MembersList';
import { type ProposalIntent } from '../ProposalSheet';
import { ProposersSection } from '../proposers/ProposersSection';
import { Button } from '../ui/button';

interface OverviewTabContext {
	multisig: MultisigWithMembersForPublicKey;
	openProposalSheet: (intent?: ProposalIntent) => void;
}

export function OverviewTab() {
	const { multisig } =
		useOutletContext<OverviewTabContext>();
	const { copied, copy } = useCopyToClipboard();
	const { network } = useNetwork();

	const getExplorerUrl = (address: string) => {
		const baseUrl = CONFIG.EXPLORER_URLS[network];
		return `${baseUrl}/account/${address}`;
	};

	const {
		data: multisigDetails,
		isLoading,
		error,
		refetch,
	} = useGetMultisig(multisig.address);

	return (
		<div className="space-y-6">
			{/* Multisig Info Card */}
			<div className="bg-card border rounded-lg p-6">
				<h2 className="text-lg font-semibold mb-4">
					Multisig Information
				</h2>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="flex flex-col">
						<label className="block text-sm font-medium text-muted-foreground mb-2">
							Address
						</label>
						<div className="flex items-center gap-2 p-3 bg-surface rounded-lg flex-1">
							<code className="text-sm font-mono text-foreground flex-1 break-all">
								{multisig.address}
							</code>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => copy(multisig.address)}
								className="h-8 px-2 shrink-0"
							>
								{copied ? (
									<Check className="w-4 h-4" />
								) : (
									<Copy className="w-4 h-4" />
								)}
							</Button>
						</div>
					</div>

					<div className="flex flex-col">
						<label className="block text-sm font-medium text-muted-foreground mb-2">
							Signature Threshold
						</label>
						<div className="flex items-center p-3 bg-surface rounded-lg flex-1">
							<span className="text-sm text-foreground">
								{multisig.threshold} of{' '}
								{multisigDetails?.members
									.map((m) => m.weight)
									.reduce((a, b) => a + b, 0)}{' '}
								weight required
							</span>
						</div>
					</div>
				</div>

				{/* Explorer Link */}
				<div className="mt-6 pt-6 border-t">
					<Button
						variant="outline"
						onClick={() =>
							window.open(
								getExplorerUrl(multisig.address),
								'_blank',
							)
						}
						className="w-full sm:w-auto"
					>
						<ExternalLink className="w-4 h-4 mr-2" />
						View on Sui Explorer
					</Button>
				</div>
			</div>

			{/* Members Section */}
			<div className="bg-card border rounded-lg p-6">
				<h2 className="text-lg font-semibold mb-4 flex items-center">
					<Users className="w-5 h-5 mr-2" />
					Members ({multisig.totalMembers})
				</h2>

				{isLoading ? (
					<div className="flex items-center justify-center py-8">
						<div className="text-sm text-muted-foreground">
							Loading member details...
						</div>
					</div>
				) : error ? (
					<div className="text-sm text-muted-foreground text-center py-8">
						<p className="mb-4">
							Failed to load member details
						</p>
						<Button
							variant="outline"
							onClick={() => refetch()}
						>
							Retry
						</Button>
					</div>
				) : multisigDetails ? (
					<MembersList members={multisigDetails.members} />
				) : null}
			</div>

			{/* Proposers Section */}
			{multisigDetails ? (
				<ProposersSection
					proposers={multisigDetails.proposers}
					multisigAddress={multisig.address}
					isLoading={isLoading}
					error={error}
				/>
			) : null}
		</div>
	);
}
