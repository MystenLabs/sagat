// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import {
	BrowserRouter,
	useLocation,
} from 'react-router-dom';

import { AppRouter } from './components/AppRouter';
import {
	AppCrashed,
	PageCrashed,
} from './components/CrashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './components/shell/AppShell';
import { TestModeBanner } from './components/TestModeBanner';
import { useNetwork } from './contexts/NetworkContext';

function AppContent() {
	const location = useLocation();
	const { isTestMode, network } = useNetwork();
	const currentAccount = useCurrentAccount();

	// Hide the banner on the create flow and the public tools pages.
	const hideBanner =
		location.pathname === '/create' ||
		location.pathname.startsWith('/tools');
	const showBanner = isTestMode && !hideBanner;

	return (
		<AppShell>
			<ErrorBoundary
				resetKey={`${network}|${currentAccount?.address ?? ''}|${location.pathname}`}
				fallback={({ reset }) => (
					<PageCrashed onRetry={reset} />
				)}
			>
				{showBanner && <TestModeBanner />}
				<AppRouter />
			</ErrorBoundary>
		</AppShell>
	);
}

function App() {
	return (
		<ErrorBoundary fallback={() => <AppCrashed />}>
			<BrowserRouter>
				<AppContent />
			</BrowserRouter>
		</ErrorBoundary>
	);
}

export default App;
