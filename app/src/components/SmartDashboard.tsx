// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { Mail, Plus, Users } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';

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
			<SkeletonPage rows={3} message="Loading accounts" />
		);

	// Case 1: User has active multisigs - smart redirect
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
						to={`/multisig/${lastViewedMultisig}/proposals`}
						replace
					/>
				);
			}
		}

		// Default: redirect to first available multisig
		return (
			<Navigate
				to={`/multisig/${multisigs?.[0].address}/proposals`}
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
			<PageHeader title="Accounts" />
			<EmptyState
				icon={Users}
				title="You’re not in any accounts yet"
				description="Create an account to hold funds with other signers, or accept an invitation when someone adds you to theirs."
				action={
					<>
						<Button
							render={<Link to="/create" />}
							nativeButton={false}
							data-testid="create-first-multisig"
						>
							<Plus />
							Create an account
						</Button>
						<Button
							variant="outline"
							render={<Link to="/invitations" />}
							nativeButton={false}
							data-testid="view-invitations"
						>
							<Mail />
							View invitations
						</Button>
					</>
				}
			/>
		</div>
	);
}
