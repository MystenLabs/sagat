// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
	useNetwork,
	type SuiNetwork,
} from '@/contexts/NetworkContext';

import { useGetProposal } from '../hooks/useGetProposal';
import { ProposalCard } from './proposals/ProposalCard';
import { Button } from './ui/button';
import { EmptyState } from './ui/empty-state';
import { Loading } from './ui/loading';
import { PageHeader } from './ui/page-header';

export function ProposalDetailPage() {
	const [searchParams] = useSearchParams();
	const digest = searchParams.get('digest');
	const { network, setNetwork } = useNetwork();

	// Fetch proposal by digest
	const proposalQuery = useGetProposal(digest);

	const formattedProposal = useMemo(() => {
		if (!proposalQuery.data) return null;
		return {
			...proposalQuery.data,
			isPublic: true,
			proposers: [],
		};
	}, [proposalQuery.data]);

	// No digest in URL
	if (!digest) {
		return (
			<div className="max-w-4xl mx-auto mt-8 px-4">
				<PageHeader
					title="Proposal Not Found"
					description="No proposal digest provided in URL"
				/>
				<EmptyState
					title="Missing Digest"
					description="Please provide a valid proposal digest in the URL query parameter (?digest=...)"
				/>
			</div>
		);
	}

	// Loading state
	if (proposalQuery.isLoading) {
		return <Loading message="Loading proposal..." />;
	}

	// Error state
	if (proposalQuery.error) {
		return (
			<div className="max-w-4xl mx-auto mt-8 px-4">
				<PageHeader
					title="Error Loading Proposal"
					description="Failed to load proposal details"
				/>
				<div className="mt-8">
					<div className="border border-error-border bg-error rounded-lg p-6 flex items-start gap-3">
						<AlertCircle className="w-5 h-5 text-error-foreground mt-0.5" />
						<div>
							<h3 className="font-medium text-error-foreground mb-1">
								{proposalQuery.error instanceof Error
									? proposalQuery.error.message
									: 'Failed to load proposal'}
							</h3>
							<p className="text-sm text-error-foreground">
								Please check that the digest is correct.
							</p>
						</div>
					</div>
				</div>
			</div>
		);
	}

	const proposal = proposalQuery.data;

	const showNetworkMissmatch =
		proposal?.network !== network;

	const handleSwitchNetwork = () => {
		const network = proposal?.network;
		if (network === 'testnet' || network === 'mainnet')
			setNetwork(network);
	};

	return (
		<div className="container mx-auto mt-8 px-4">
			<PageHeader
				title="Proposal Details"
				description={`Digest: ${digest}`}
			/>

			{showNetworkMissmatch && (
				<NetworkMismatchBanner
					requestedNetwork={proposal?.network as SuiNetwork}
					currentNetwork={network}
					onSwitch={handleSwitchNetwork}
				/>
			)}
			<div className="mt-8">
				{formattedProposal && (
					<ProposalCard
						proposal={formattedProposal}
						defaultExpanded={true}
					/>
				)}
			</div>
		</div>
	);
}

function NetworkMismatchBanner({
	requestedNetwork,
	currentNetwork,
	onSwitch,
}: {
	requestedNetwork: SuiNetwork;
	currentNetwork: SuiNetwork;
	onSwitch: () => void;
}) {
	return (
		<div className="mt-4 border border-warning-border bg-warning rounded-lg p-4 flex items-start gap-3">
			<AlertTriangle className="w-5 h-5 text-warning-foreground mt-0.5 shrink-0" />
			<div className="flex-1">
				<h3 className="font-medium text-warning-foreground mb-1">
					Network Mismatch
				</h3>
				<p className="text-sm text-warning-foreground mb-3">
					This proposal is for{' '}
					<strong>{requestedNetwork}</strong>, but you're
					currently on <strong>{currentNetwork}</strong>.
					Switch networks to view the correct proposal.
				</p>
				<Button
					size="sm"
					onClick={onSwitch}
					className="bg-yellow-600 hover:bg-yellow-700"
				>
					Switch to {requestedNetwork}
				</Button>
			</div>
		</div>
	);
}
