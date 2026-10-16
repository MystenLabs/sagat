// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	BrowserRouter,
	useLocation,
} from 'react-router-dom';

import { AppRouter } from './components/AppRouter';
import { AppShell } from './components/shell/AppShell';
import { TestModeBanner } from './components/TestModeBanner';
import { useNetwork } from './contexts/NetworkContext';

function AppContent() {
	const location = useLocation();
	const { isTestMode } = useNetwork();

	// Hide the banner on the create flow and the public tools pages.
	const hideBanner =
		location.pathname === '/create' ||
		location.pathname.startsWith('/tools');
	const showBanner = isTestMode && !hideBanner;

	return (
		<AppShell contentClassName={showBanner ? 'pb-20' : ''}>
			<AppRouter />
			{showBanner && <TestModeBanner />}
		</AppShell>
	);
}

function App() {
	return (
		<BrowserRouter>
			<AppContent />
		</BrowserRouter>
	);
}

export default App;
