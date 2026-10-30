// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useCurrentNetwork,
} from '@mysten/dapp-kit-react';
import { useMemo, type ReactElement } from 'react';
import {
	Navigate,
	Route,
	Routes,
	useLocation,
} from 'react-router-dom';

import { content } from '@/content';
import { getAuthLevel } from '@/lib/auth-level';

import { TOOLS } from '../config/tools';
import { useApiAuth } from '../contexts/ApiAuthContext';
import { useSessionBoot } from '../hooks/useSessionBoot';
import { ApiUnreachable } from './ApiUnreachable';
import { ConnectWalletCard } from './ConnectWalletCard';
import { CreateMultisigPage } from './create-multisig/CreateMultisigPage';
import { DevnetNotSupported } from './DevnetNotSupported';
import { InvitationsPage } from './InvitationsPage';
import { MultisigDetailPage } from './MultisigDetailPage';
import { NewProposalPage } from './new-proposal/NewProposalPage';
import { ProposalPage } from './proposal/ProposalPage';
import { SharedProposalPage } from './proposal/SharedProposalPage';
import { SmartDashboard } from './SmartDashboard';
import { AssetsTab } from './tabs/AssetsTab';
import { OverviewTab } from './tabs/OverviewTab';
import { ProposalsTab } from './tabs/ProposalsTab';
import { SignersTab } from './tabs/SignersTab';
import { ToolsPage } from './ToolsPage';
import { SkeletonPage } from './ui/skeleton';

// Which of these need a wallet or a sign-in is `getAuthLevel`'s table.
interface RouteConfig {
	path: string;
	element: ReactElement;
	children?: RouteConfig[];
}

const routes: RouteConfig[] = [
	{
		path: '/tools',
		element: <ToolsPage />,
	},
	// Dynamically generate routes for all tools
	...TOOLS.map((tool) => ({
		path: tool.path,
		element: <ToolsPage />,
	})),
	{
		path: '/proposals',
		element: <SharedProposalPage />,
	},
	{
		path: '/',
		element: <SmartDashboard />,
	},
	{
		path: '/create',
		element: <CreateMultisigPage />,
	},
	{
		path: '/invitations',
		element: <InvitationsPage />,
	},
	// Its own page, not one of the account's tabs. React Router ranks
	// routes by how specific they are, so the order here doesn't matter.
	{
		path: '/multisig/:address/proposals/new',
		element: <NewProposalPage />,
	},
	// The account shell renders its own header, so a proposal's page is
	// not one of its children either.
	{
		path: '/multisig/:address/proposals/:digest',
		element: <ProposalPage />,
	},
	{
		path: '/multisig/:address',
		element: <MultisigDetailPage />,
		children: [
			{
				path: '',
				element: <Navigate to="overview" replace />,
			},
			{
				path: 'proposals',
				element: <ProposalsTab />,
			},
			{
				path: 'overview',
				element: <OverviewTab />,
			},
			{
				path: 'assets',
				element: <AssetsTab />,
			},
			{
				path: 'signers',
				element: <SignersTab />,
			},
		],
	},
];

export function AppRouter() {
	const currentAccount = useCurrentAccount();
	const { reconnecting, checkingAuth } = useSessionBoot();
	const {
		isApiUnreachable,
		isCurrentAddressAuthenticated,
	} = useApiAuth();
	const location = useLocation();
	const network = useCurrentNetwork();

	const authLevel = useMemo(
		() => getAuthLevel(location.pathname),
		[location.pathname],
	);

	const renderRoutes = useMemo(() => {
		const renderRoute = (
			route: RouteConfig,
			index: number,
		) => {
			if (route.children) {
				return (
					<Route
						key={index}
						path={route.path}
						element={route.element}
					>
						{route.children.map((child, childIndex) =>
							child.path === '' ? (
								<Route
									key={childIndex}
									index
									element={child.element}
								/>
							) : (
								<Route
									key={childIndex}
									path={child.path}
									element={child.element}
								/>
							),
						)}
					</Route>
				);
			}
			return (
				<Route
					key={index}
					path={route.path}
					element={route.element}
				/>
			);
		};

		return (
			<Routes>
				{routes.map(renderRoute)}
				<Route
					path="*"
					element={<Navigate to="/" replace />}
				/>
			</Routes>
		);
	}, []);

	// Public routes - no auth required
	if (authLevel === 'public') {
		return renderRoutes;
	}

	if (network === 'devnet') {
		return <DevnetNotSupported />;
	}

	// The wallet kit is still restoring the previous session: hold the
	// layout instead of flashing the connect prompt.
	if (reconnecting) {
		return (
			<SkeletonPage
				rows={3}
				message={content.shell.reconnectingWallet}
				testId="wallet-reconnecting"
			/>
		);
	}

	// Full auth routes - require wallet + API auth. Wallet-only routes
	// connect without asking for the sign-in signature.
	if (!currentAccount) return <ConnectWalletCard />;

	// Wallet-only routes - require wallet but not API auth
	if (authLevel === 'wallet') return renderRoutes;

	if (checkingAuth) {
		return (
			<SkeletonPage
				rows={3}
				message={content.shell.checkingAuth}
			/>
		);
	}

	if (isApiUnreachable) return <ApiUnreachable />;

	if (!isCurrentAddressAuthenticated) {
		return <ConnectWalletCard />;
	}

	return renderRoutes;
}
