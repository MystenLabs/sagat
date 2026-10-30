// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import {
	Navigate,
	Outlet,
	useLocation,
	useNavigate,
	useParams,
} from 'react-router-dom';

import { content } from '@/content';
import { useArrivalBanner } from '@/hooks/useArrivalBanner';
import { accountName } from '@/lib/account-name';
import { joinList } from '@/lib/create-multisig';
import { lastViewedMultisigKey } from '@/lib/localStorageKeys';
import {
	currentMultisigPage,
	MULTISIG_PAGES,
} from '@/lib/multisig-pages';
import { newProposalPath } from '@/lib/new-proposal';

import { useUserMultisigs } from '../hooks/useUserMultisigs';
import { SuccessBanner } from './multisig/SuccessBanner';
import { Button } from './ui/button';
import { PageHeader } from './ui/page-header';
import { SkeletonPage } from './ui/skeleton';

export function MultisigDetailPage() {
	const { address } = useParams<{ address: string }>();
	const location = useLocation();
	const page = currentMultisigPage(location.pathname);
	const navigate = useNavigate();
	const currentAccount = useCurrentAccount();
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
		return (
			<SkeletonPage message={content.overview.loading} />
		);
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
	// The page is the title, as in the designs; the account is the eyebrow
	// above it. The address lives in the switcher and the Receive dialog.
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
				eyebrow={{ label: name, mono: !multisig.name }}
				title={title}
				actions={
					<Button
						variant="secondary"
						onClick={() =>
							navigate(newProposalPath(multisig.address))
						}
						data-testid="new-proposal-button"
					>
						<Plus />
						{content.overview.newProposal}
					</Button>
				}
			/>

			{arrival?.kind === 'joined' && (
				<SuccessBanner
					onDismiss={dismissArrival}
					testId="joined-banner"
				>
					{content.overview.joined(
						name,
						multisig.pendingMembers,
					)}
				</SuccessBanner>
			)}
			{arrival?.kind === 'created' && (
				<SuccessBanner
					onDismiss={dismissArrival}
					testId="created-banner"
				>
					{content.overview.created(
						joinList(arrival.invited, 'and'),
					)}
				</SuccessBanner>
			)}

			{/* Tab Content */}
			<div>
				<Outlet context={{ multisig }} />
			</div>
		</div>
	);
}
