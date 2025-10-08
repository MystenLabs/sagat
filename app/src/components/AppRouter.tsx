import { useCurrentAccount } from '@mysten/dapp-kit';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { AuthPrompt } from './AuthPrompt';
import { CreateMultisigPage } from './CreateMultisigPage';
import { CustomWalletButton } from './CustomWalletButton';
import { InvitationsPage } from './InvitationsPage';
import { MultisigDetailPage } from './MultisigDetailPage';
import { SmartDashboard } from './SmartDashboard';
import { AssetsTab } from './tabs/AssetsTab';
import { OverviewTab } from './tabs/OverviewTab';
import { ProposalsTab } from './tabs/ProposalsTab';
import { Loading } from './ui/loading';

export function AppRouter() {
	// Wallet state from dApp Kit
	const currentAccount = useCurrentAccount();

	// API auth state
	const { isCheckingAuth, isCurrentAddressAuthenticated } =
		useApiAuth();

	// State 1: No wallet connected
	if (!currentAccount) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh]">
				<h1 className="text-3xl font-bold mb-4">
					Welcome to Sagat
				</h1>
				<p className="text-gray-600 mb-8">
					Connect your wallet to manage multisig accounts
				</p>
				<CustomWalletButton variant="sidebar" />
			</div>
		);
	}

	// State 2: Wallet connected, checking auth
	if (isCheckingAuth) {
		return <Loading message="Checking authentication..." />;
	}

	// State 3: Wallet connected but not authenticated with API
	if (!isCurrentAddressAuthenticated) {
		return <AuthPrompt />;
	}

	// State 4: Authenticated - show routes
	return (
		<Routes>
			<Route path="/" element={<SmartDashboard />} />
			<Route
				path="/create"
				element={<CreateMultisigPage />}
			/>
			<Route
				path="/invitations"
				element={<InvitationsPage />}
			/>

			{/* Multisig Detail Routes */}
			<Route
				path="/multisig/:address"
				element={<MultisigDetailPage />}
			>
				<Route
					index
					element={<Navigate to="proposals" replace />}
				/>
				<Route
					path="proposals"
					element={<ProposalsTab />}
				/>
				<Route path="overview" element={<OverviewTab />} />
				<Route path="assets" element={<AssetsTab />} />
			</Route>

			<Route
				path="*"
				element={<Navigate to="/" replace />}
			/>
		</Routes>
	);
}
