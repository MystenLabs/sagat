// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { formatAddress } from '@mysten/sui/utils';
import { Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
	Navigate,
	Outlet,
	useLocation,
	useNavigate,
	useParams,
} from 'react-router-dom';

import { lastViewedMultisigKey } from '@/lib/localStorageKeys';

import { useUserMultisigs } from '../hooks/useUserMultisigs';
import {
	ProposalSheet,
	type ProposalIntent,
} from './ProposalSheet';
import { Alert } from './ui/Alert';
import { Button } from './ui/button';
import { PageHeader } from './ui/page-header';
import { SkeletonPage } from './ui/skeleton';

export function MultisigDetailPage() {
	const { address } = useParams<{ address: string }>();
	const currentAccount = useCurrentAccount();
	const [showProposalSheet, setShowProposalSheet] =
		useState(false);
	const [proposalIntent, setProposalIntent] =
		useState<ProposalIntent | null>(null);
	const { data: multisigs, isLoading } = useUserMultisigs();
	// Set by the invitation flow right after accepting.
	const location = useLocation();
	const navigate = useNavigate();
	const joined = !!(
		location.state as { joined?: boolean } | null
	)?.joined;

	// Find the multisig details from the selected accts
	const multisigDetails = useMemo(
		() =>
			multisigs?.find(
				(m) => m.address === address && m.isAccepted,
			),
		[multisigs, address],
	);

	// Verified are the multisigs that we've accepted participation
	const verifiedMultisigs = useMemo(
		() => multisigs?.filter((m) => m.isAccepted) ?? [],
		[multisigs],
	);

	// Store the current multisig address in localStorage per wallet address
	useEffect(() => {
		const multisig = verifiedMultisigs.find(
			(m) => m.address === address,
		);
		if (
			address &&
			multisig?.isAccepted &&
			currentAccount?.address
		) {
			localStorage.setItem(
				lastViewedMultisigKey(currentAccount.address),
				address,
			);
		}
	}, [address, verifiedMultisigs, currentAccount?.address]);

	if (isLoading) {
		return <SkeletonPage message="Loading account" />;
	}

	// If we're trying to access a specific multisig but it's not verified, redirect to dashboard
	if (
		address &&
		multisigDetails &&
		!multisigDetails.isAccepted
	) {
		return <Navigate to="/" replace />;
	}

	// If we're trying to access a multisig that doesn't exist, redirect to dashboard
	if (address && !isLoading && !multisigDetails) {
		return <Navigate to="/" replace />;
	}

	if (verifiedMultisigs.length === 0) {
		return <Navigate to="/" replace />;
	}

	const multisig = verifiedMultisigs.find(
		(m) => m.address === address,
	);

	if (!multisig) {
		// Multisig not found for current wallet - redirect to dashboard which will handle smart routing
		return <Navigate to="/" replace />;
	}

	const title =
		multisig.name || formatAddress(multisig.address);

	return (
		<div
			className="page-shell"
			data-testid="multisig-detail"
			data-multisig-address={multisig.address}
		>
			<PageHeader
				breadcrumb={[
					{ label: 'Multisigs', to: '/' },
					{ label: title, mono: !multisig.name },
				]}
				title={title}
				address={multisig.address}
				actions={
					<Button
						onClick={() => {
							setProposalIntent({ kind: 'custom' });
							setShowProposalSheet(true);
						}}
						data-testid="new-proposal-button"
					>
						<Plus />
						New proposal
					</Button>
				}
			/>

			{joined && (
				<Alert
					variant="success"
					className="mb-6 items-center font-medium"
					data-testid="joined-banner"
				>
					<div className="flex items-center gap-3">
						<span className="flex-1">
							You joined {title}.
							{multisig.pendingMembers > 0 &&
								` ${multisig.pendingMembers} ${
									multisig.pendingMembers === 1
										? 'signer hasn’t'
										: 'signers haven’t'
								} accepted yet.`}
						</span>
						<button
							type="button"
							aria-label="Dismiss"
							className="cursor-pointer rounded-sm opacity-70 hover:opacity-100"
							onClick={() =>
								navigate(location.pathname, {
									replace: true,
									state: null,
								})
							}
						>
							<X className="size-3.5" />
						</button>
					</div>
				</Alert>
			)}

			{/* Tab Content */}
			<div>
				<Outlet
					context={{
						multisig,
						openProposalSheet: (
							intent?: ProposalIntent,
						) => {
							setProposalIntent(
								intent ?? { kind: 'custom' },
							);
							setShowProposalSheet(true);
						},
					}}
				/>
			</div>

			{/* Proposal Creation Sheet */}
			<ProposalSheet
				open={showProposalSheet}
				onOpenChange={(open) => {
					setShowProposalSheet(open);
					if (!open) setProposalIntent(null);
				}}
				multisigAddress={address!}
				intent={proposalIntent}
			/>
		</div>
	);
}
