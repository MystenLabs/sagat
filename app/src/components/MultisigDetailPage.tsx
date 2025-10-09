import { useCurrentAccount } from '@mysten/dapp-kit';
import {
	Check,
	Coins,
	Copy,
	FileText,
	Info,
	Plus,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
	Navigate,
	NavLink,
	Outlet,
	useNavigate,
	useParams,
} from 'react-router-dom';

import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { useUserMultisigs } from '../hooks/useUserMultisigs';
import { MultisigSelector } from './MultisigSelector';
import { ProposalSheet } from './ProposalSheet';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Loading } from './ui/loading';

export function MultisigDetailPage() {
	const { address, tab } = useParams<{
		address: string;
		tab?: string;
	}>();
	const navigate = useNavigate();
	const currentAccount = useCurrentAccount();
	const [showProposalSheet, setShowProposalSheet] =
		useState(false);
	const { copied, copy } = useCopyToClipboard();

	const { data: multisigs, isLoading } = useUserMultisigs();

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

	// Handle multisig selection change
	const handleMultisigChange = (newAddress: string) => {
		navigate(
			`/multisig/${newAddress}/${tab || 'proposals'}`,
		);
	};

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
			const lastViewedKey = `lastViewedMultisig_${currentAccount.address}`;
			localStorage.setItem(lastViewedKey, address);
		}
	}, [address, verifiedMultisigs, currentAccount?.address]);

	if (isLoading || isLoading) {
		return (
			<Loading message="Loading multisig details..." />
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

	const tabs = [
		{
			id: 'proposals',
			label: 'Proposals',
			icon: FileText,
		},
		{
			id: 'overview',
			label: 'Overview',
			icon: Info,
			count: multisig.pendingMembers,
		},
		{ id: 'assets', label: 'Assets', icon: Coins },
	];

	// Remove this line since we'll use NavLink's built-in active state

	return (
		<div className="container mx-auto mt-8 px-4">
			{/* Header */}
			<div className="mb-6">
				{/* Multisig Selector & Info */}
				<div className="bg-white border rounded-lg p-6 mb-6">
					<div className="flex flex-col gap-6">
						{/* Multisig Selector */}
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
							<div className="flex-1 min-w-0">
								<MultisigSelector
									multisigs={verifiedMultisigs}
									selectedMultisig={address!}
									onSelectMultisig={handleMultisigChange}
								/>
							</div>
							<div className="flex items-center space-x-3 flex-shrink-0">
								<Button
									variant="outline"
									onClick={() => copy(address!)}
									className="whitespace-nowrap"
									title="Copy multisig address"
								>
									{copied ? (
										<Check className="w-4 h-4" />
									) : (
										<Copy className="w-4 h-4" />
									)}
								</Button>
								<Button
									onClick={() => setShowProposalSheet(true)}
								>
									<Plus className="w-4 h-4 mr-2" />
									New Proposal
								</Button>
							</div>
						</div>

						{/* Quick Info Bar */}
						<div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap pt-4 border-t">
							<Label variant="success">
								{multisig.threshold} threshold •{' '}
								{multisig.totalMembers} members
							</Label>
							<Label
								variant={
									multisig.isVerified
										? 'success'
										: multisig.rejectedMembers > 0
											? 'error'
											: 'info'
								}
							>
								{multisig.isVerified
									? 'Verified'
									: multisig.rejectedMembers > 0
										? 'Rejected'
										: 'Pending'}
							</Label>
						</div>
					</div>
				</div>

				{/* Navigation Tabs */}
				<div className="overflow-x-auto border-b">
					<div className="flex space-x-1 min-w-max">
						{tabs.map((tabItem) => {
							const Icon = tabItem.icon;

							return (
								<NavLink
									key={tabItem.id}
									to={`/multisig/${address}/${tabItem.id}`}
									className={({ isActive }) =>
										`px-4 py-2 text-sm shrink-0 font-medium transition-colors relative whitespace-nowrap flex items-center gap-2 ${
											isActive
												? 'text-blue-600 border-b-2 border-blue-600'
												: 'text-gray-600 hover:text-gray-900'
										}`
									}
								>
									<Icon className="w-4 h-4" />
									{tabItem.label}
									{(tabItem.count && tabItem.count > 0 && (
										<Label
											variant="warning"
											size="sm"
											className="ml-1"
										>
											{tabItem.count} pending
										</Label>
									)) ||
										null}
								</NavLink>
							);
						})}
					</div>
				</div>
			</div>

			{/* Tab Content */}
			<div>
				<Outlet
					context={{
						multisig,
						openProposalSheet: () =>
							setShowProposalSheet(true),
					}}
				/>
			</div>

			{/* Proposal Creation Sheet */}
			<ProposalSheet
				open={showProposalSheet}
				onOpenChange={setShowProposalSheet}
				multisigAddress={address!}
			/>
		</div>
	);
}
