// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { Mail, Plus, Users } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';

import { content } from '@/content';
import { lastViewedMultisigKey } from '@/lib/localStorageKeys';

import { useUserMultisigs } from '../hooks/useUserMultisigs';
import { Button } from './ui/button';
import { EmptyState } from './ui/empty-state';
import { PageHeader } from './ui/page-header';
import { SkeletonPage } from './ui/skeleton';

export function SmartDashboard() {
	const { data: multisigs, isLoading } = useUserMultisigs(); // Only accepted multisigs
	const currentAccount = useCurrentAccount();

	if (isLoading)
		return (
			<SkeletonPage
				rows={3}
				message={content.firstUse.loading}
			/>
		);

	// Case 1: User has active multisigs - land on an account's overview
	if (multisigs?.length && multisigs.length > 0) {
		// Check if there's a last viewed multisig for this wallet address
		const walletAddress = currentAccount?.address;
		const lastViewedKey = walletAddress
			? lastViewedMultisigKey(walletAddress)
			: null;
		const lastViewedMultisig = lastViewedKey
			? localStorage.getItem(lastViewedKey)
			: null;

		if (lastViewedMultisig) {
			// Check if this multisig still belongs to the current address
			const isValidMultisig = multisigs?.some(
				(m) => m.address === lastViewedMultisig,
			);
			if (isValidMultisig) {
				return (
					<Navigate
						to={`/multisig/${lastViewedMultisig}/overview`}
						replace
					/>
				);
			}
		}

		// Default: the first available multisig's overview
		return (
			<Navigate
				to={`/multisig/${multisigs?.[0].address}/overview`}
				replace
			/>
		);
	}

	// Case 2: in no accounts yet - create one or answer an invitation
	return (
		<div
			className="page-shell"
			data-testid="dashboard-empty"
		>
			<PageHeader title={content.firstUse.title} />
			<EmptyState
				icon={Users}
				title={content.firstUse.emptyTitle}
				description={content.firstUse.emptyDescription}
				action={
					<>
						<Button
							render={<Link to="/create" />}
							nativeButton={false}
							data-testid="create-first-multisig"
						>
							<Plus />
							{content.firstUse.createAccount}
						</Button>
						<Button
							variant="outline"
							render={<Link to="/invitations" />}
							nativeButton={false}
							data-testid="view-invitations"
						>
							<Mail />
							{content.firstUse.viewInvitations}
						</Button>
					</>
				}
			/>
		</div>
	);
}
