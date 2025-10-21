import {
	BrowserRouter,
	useLocation,
} from 'react-router-dom';

import { AppRouter } from './components/AppRouter';
import { Header } from './components/header';
import { TestModeBanner } from './components/TestModeBanner';
import { useNetwork } from './contexts/NetworkContext';

function AppContent() {
	const location = useLocation();
	const { isTestMode } = useNetwork();
	const hideHeaderOnPaths = ['/create'];
	const hideBannerOnPaths = ['/create'];

	// Hide banner on tools pages (public/offline pages)
	const shouldHideHeader = hideHeaderOnPaths.includes(
		location.pathname,
	);
	const shouldHideBanner =
		hideBannerOnPaths.includes(location.pathname) ||
		location.pathname.startsWith('/tools');

	const showBanner = isTestMode && !shouldHideBanner;

	return (
		<div className={showBanner ? 'pb-20' : ''}>
			{!shouldHideHeader && <Header />}
			<AppRouter />
			{!shouldHideBanner && <TestModeBanner />}
		</div>
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
