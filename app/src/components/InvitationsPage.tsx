// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Mail } from 'lucide-react';
import { useState } from 'react';

import { content } from '@/content';

import { useInvitations } from '../hooks/useInvitations';
import { InvitationCard } from './invitations/InvitationCard';
import { EmptyState, ErrorState } from './ui/empty-state';
import { PageHeader } from './ui/page-header';
import { SkeletonRows } from './ui/skeleton';
import { Tabs } from './ui/tabs';

type TabType = 'pending' | 'rejected';

/** The invitations inbox: accounts asking the signed-in key to join. */
export function InvitationsPage() {
	const [activeTab, setActiveTab] =
		useState<TabType>('pending');
	const pending = useInvitations(false);
	// Nothing shows the rejected list until its tab opens.
	const rejected = useInvitations(true, {
		enabled: activeTab === 'rejected',
	});

	const current =
		activeTab === 'pending' ? pending : rejected;
	const invitations = current.data ?? [];
	const isLoading = current.isLoading;

	return (
		<div
			className="page-shell"
			data-testid="invitations-page"
		>
			<PageHeader
				title={content.invitations.page.title}
				description={content.invitations.page.description}
			/>

			<Tabs
				tabs={[
					{
						id: 'pending',
						label: content.invitations.page.pendingTab,
						count: pending.data?.length,
						countColor: 'gray',
					},
					{
						id: 'rejected',
						label: content.invitations.page.rejectedTab,
					},
				]}
				activeTab={activeTab}
				onTabChange={(id) => setActiveTab(id as TabType)}
				testId="invitations-tab"
				className="mb-6"
			/>

			{isLoading ? (
				<SkeletonRows
					rows={2}
					header={false}
					testId="invitations-loading"
				/>
			) : current.isError && !current.data ? (
				<ErrorState
					title={content.invitations.page.loadFailed}
					error={current.error}
					onRetry={() => current.refetch()}
					testId="invitations-error"
				/>
			) : invitations.length === 0 ? (
				<EmptyState
					icon={Mail}
					testId="invitations-empty"
					title={
						activeTab === 'pending'
							? content.invitations.page.emptyPendingTitle
							: content.invitations.page.emptyRejectedTitle
					}
					description={
						activeTab === 'pending'
							? content.invitations.page
									.emptyPendingDescription
							: content.invitations.page
									.emptyRejectedDescription
					}
				/>
			) : (
				<div className="flex flex-col gap-3">
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
