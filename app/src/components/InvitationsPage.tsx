import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useInvitations } from '../hooks/useInvitations';
import { InvitationCard } from './invitations/InvitationCard';
import { Button } from './ui/button';
import { EmptyState } from './ui/empty-state';
import { Loading } from './ui/loading';
import { PageHeader } from './ui/page-header';
import { Tabs } from './ui/tabs';

type TabType = 'pending' | 'rejected';

export function InvitationsPage() {
	const [activeTab, setActiveTab] =
		useState<TabType>('pending');
	const {
		data: pendingInvites,
		isLoading: isPendingLoading,
		isFetching: isPendingFetching,
	} = useInvitations(false);

	// Only fetch rejected invitations when the user switches to that tab
	const shouldFetchRejected = activeTab === 'rejected';
	const {
		data: rejectedInvites,
		isLoading: isRejectedLoading,
		isFetching: isRejectedFetching,
	} = useInvitations(true, shouldFetchRejected);

	const isLoading =
		activeTab === 'pending'
			? isPendingLoading && isPendingFetching
			: isRejectedLoading && isRejectedFetching;

	const invitations =
		activeTab === 'pending'
			? pendingInvites
			: rejectedInvites;

	const tabs = useMemo(
		() => [
			{
				id: 'pending',
				label: 'Pending',
				count: pendingInvites?.length,
				countColor: 'blue' as const,
			},
			{
				id: 'rejected',
				label: 'Rejected',
				// Don't show count - will load when tab is clicked
				countColor: 'gray' as const,
			},
		],
		[pendingInvites?.length],
	);

	if (isLoading)
		return <Loading message="Loading invitations..." />;

	return (
		<div className="max-w-4xl mx-auto mt-8 px-4">
			<PageHeader
				title="Invitations"
				description={
					activeTab === 'pending'
						? `You have ${pendingInvites?.length ?? 0} pending invitation${(pendingInvites?.length ?? 0) !== 1 ? 's' : ''}`
						: `You have ${rejectedInvites?.length ?? 0} rejected invitation${(rejectedInvites?.length ?? 0) !== 1 ? 's' : ''}`
				}
				backLink="/"
				backLabel="Back to Dashboard"
			/>

			<div className="mb-6">
				<Tabs
					tabs={tabs}
					activeTab={activeTab}
					onTabChange={(id) => setActiveTab(id as TabType)}
				/>
			</div>

			{/* Content */}
			{!invitations || invitations.length === 0 ? (
				<EmptyState
					title={
						activeTab === 'pending'
							? 'No pending invitations'
							: 'No rejected invitations'
					}
					description={
						activeTab === 'pending'
							? "You don't have any pending multisig invitations at the moment"
							: "You haven't rejected any multisig invitations"
					}
					action={
						<Link to="/">
							<Button variant="outline">
								Back to Dashboard
							</Button>
						</Link>
					}
				/>
			) : (
				<div className="space-y-3">
					{invitations.map((multisig) => (
						<InvitationCard
							key={multisig.address}
							multisig={multisig}
						/>
					))}
				</div>
			)}
		</div>
	);
}
