// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
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
import { accountName } from './invitations/account-name';
import {
	ProposalSheet,
	type ProposalIntent,
} from './ProposalSheet';
import { Alert } from './ui/Alert';
import { Button } from './ui/button';
import { PageHeader } from './ui/page-header';
import { SkeletonPage } from './ui/skeleton';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from './ui/tooltip';

export function MultisigDetailPage() {
	const { address } = useParams<{ address: string }>();
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
	// Set by the invitation flow right after accepting. Router state
	// lives in history, so it is copied here and cleared at once: the
	// greeting shows one time, not again on reload or Back. It belongs
	// to the page it landed on and goes once you move to another tab.
	const location = useLocation();
	const navigate = useNavigate();
	const joinedState = !!(
		location.state as { joined?: boolean } | null
	)?.joined;
	const [joinedAt, setJoinedAt] = useState<string | null>(
		() => (joinedState ? location.pathname : null),
	);
	// Adjusted during render (not in an effect) so the banner never
	// flashes on the wrong page.
	if (joinedState && joinedAt !== location.pathname) {
		setJoinedAt(location.pathname);
	} else if (
		!joinedState &&
		joinedAt &&
		joinedAt !== location.pathname
	) {
		setJoinedAt(null);
	}
	useEffect(() => {
		if (!joinedState) return;
		navigate(location.pathname + location.search, {
			replace: true,
			state: null,
		});
	}, [
		joinedState,
		location.pathname,
		location.search,
		navigate,
	]);
	const joined = joinedAt === location.pathname;

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

	const title = accountName(multisig);

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
						<TooltipProvider delay={150}>
							<Tooltip>
								<TooltipTrigger
									type="button"
									aria-label="Dismiss"
									className="cursor-pointer rounded-sm opacity-70 hover:opacity-100"
									onClick={() => setJoinedAt(null)}
									data-testid="joined-banner-dismiss"
								>
									<X className="size-4" />
								</TooltipTrigger>
								<TooltipContent>Dismiss</TooltipContent>
							</Tooltip>
						</TooltipProvider>
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
