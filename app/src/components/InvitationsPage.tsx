// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Mail } from 'lucide-react';
import { useState } from 'react';

import { useInvitations } from '../hooks/useInvitations';
import { InvitationCard } from './invitations/InvitationCard';
import { EmptyState } from './ui/empty-state';
import { PageHeader } from './ui/page-header';
import { SkeletonRows } from './ui/skeleton';
import { Tabs } from './ui/tabs';

type TabType = 'pending' | 'rejected';

/** The invitations inbox: accounts asking the signed-in key to join. */
export function InvitationsPage() {
	const [activeTab, setActiveTab] =
		useState<TabType>('pending');
	const pending = useInvitations(false);
	const rejected = useInvitations(true);

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
				title="Invitations"
				description="Accounts you've been asked to join as a signer."
			/>

			<Tabs
				tabs={[
					{
						id: 'pending',
						label: 'Pending',
						count: pending.data?.length,
						countColor: 'gray',
					},
					{
						id: 'rejected',
						label: 'Rejected',
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
			) : invitations.length === 0 ? (
				<EmptyState
					icon={Mail}
					testId="invitations-empty"
					title={
						activeTab === 'pending'
							? 'No invitations yet'
							: 'No rejected invitations'
					}
					description={
						activeTab === 'pending'
							? 'When someone adds you as a signer on an account, the invitation shows up here.'
							: 'Invitations you turn down stay here for your records.'
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
