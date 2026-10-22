// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
	matchPath,
	Navigate,
	Outlet,
	useLocation,
	useParams,
} from 'react-router-dom';

import { useArrivalBanner } from '@/hooks/useArrivalBanner';
import { joinList } from '@/lib/create-multisig';
import { lastViewedMultisigKey } from '@/lib/localStorageKeys';
import { MULTISIG_PAGES } from '@/lib/multisig-pages';

import { useUserMultisigs } from '../hooks/useUserMultisigs';
import { accountName } from './invitations/account-name';
import { SuccessBanner } from './multisig/SuccessBanner';
import {
	ProposalSheet,
	type ProposalIntent,
} from './ProposalSheet';
import { Button } from './ui/button';
import { PageHeader } from './ui/page-header';
import { SkeletonPage } from './ui/skeleton';

export function MultisigDetailPage() {
	const { address } = useParams<{ address: string }>();
	const location = useLocation();
	const page =
		matchPath('/multisig/:address/:page', location.pathname)
			?.params.page ?? 'proposals';
	const currentAccount = useCurrentAccount();
	const [showProposalSheet, setShowProposalSheet] =
		useState(false);
	const [proposalIntent, setProposalIntent] =
		useState<ProposalIntent | null>(null);
	const {
		data: multisigs,
		isLoading,
		isFetching,
	} = useUserMultisigs();
	// Set by the invitation and create flows: a greeting shown once.
	const [arrival, dismissArrival] = useArrivalBanner();

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

	// Also wait while the list refreshes without this account (just
	// joined), rather than redirecting on the stale list.
	if (isLoading || (isFetching && !multisigDetails)) {
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

	const name = accountName(multisig);
	// The page is the title, as in the designs; the account is the crumb.
	const title =
		MULTISIG_PAGES.find((p) => p.id === page)?.label ??
		name;

	return (
		<div
			className="page-shell"
			data-testid="multisig-detail"
			data-multisig-address={multisig.address}
		>
			<PageHeader
				breadcrumb={[
					{ label: 'Multisigs', to: '/' },
					{ label: name, mono: !multisig.name },
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

			{arrival?.kind === 'joined' && (
				<SuccessBanner
					onDismiss={dismissArrival}
					testId="joined-banner"
				>
					You joined {name}.
					{multisig.pendingMembers > 0 &&
						` ${multisig.pendingMembers} ${
							multisig.pendingMembers === 1
								? 'signer hasn’t'
								: 'signers haven’t'
						} accepted yet.`}
				</SuccessBanner>
			)}
			{arrival?.kind === 'created' && (
				<SuccessBanner
					onDismiss={dismissArrival}
					testId="created-banner"
				>
					Multisig created. Invitations sent to{' '}
					{joinList(arrival.invited, 'and')}.
				</SuccessBanner>
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
