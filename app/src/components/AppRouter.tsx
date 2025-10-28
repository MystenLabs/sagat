// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit';
import { useMemo, type ReactElement } from 'react';
import {
	matchPath,
	Navigate,
	Route,
	Routes,
	useLocation,
} from 'react-router-dom';

import { TOOLS } from '../config/tools';
import { useApiAuth } from '../contexts/ApiAuthContext';
import { AuthPrompt } from './AuthPrompt';
import { CreateMultisigPage } from './CreateMultisigPage';
import { CustomWalletButton } from './CustomWalletButton';
import { InvitationsPage } from './InvitationsPage';
import { MultisigDetailPage } from './MultisigDetailPage';
import { ProposalDetailPage } from './ProposalDetailPage';
import { SmartDashboard } from './SmartDashboard';
import { AssetsTab } from './tabs/AssetsTab';
import { OverviewTab } from './tabs/OverviewTab';
import { ProposalsTab } from './tabs/ProposalsTab';
import { ToolsPage } from './ToolsPage';
import { Loading } from './ui/loading';

type AuthLevel = 'public' | 'wallet' | 'full';

interface RouteConfig {
	path: string;
	element: ReactElement;
	authLevel: AuthLevel;
	children?: RouteConfig[];
}

const routes: RouteConfig[] = [
	{
		path: '/tools',
		element: <ToolsPage />,
		authLevel: 'public',
	},
	// Dynamically generate routes for all tools
	...TOOLS.map((tool) => ({
		path: tool.path,
		element: <ToolsPage />,
		authLevel: 'public' as AuthLevel,
	})),
	{
		path: '/proposals',
		element: <ProposalDetailPage />,
		authLevel: 'wallet',
	},
	{
		path: '/',
		element: <SmartDashboard />,
		authLevel: 'full',
	},
	{
		path: '/create',
		element: <CreateMultisigPage />,
		authLevel: 'full',
	},
	{
		path: '/invitations',
		element: <InvitationsPage />,
		authLevel: 'full',
	},
	{
		path: '/multisig/:address',
		element: <MultisigDetailPage />,
		authLevel: 'full',
		children: [
			{
				path: '',
				element: <Navigate to="proposals" replace />,
				authLevel: 'full',
			},
			{
				path: 'proposals',
				element: <ProposalsTab />,
				authLevel: 'full',
			},
			{
				path: 'overview',
				element: <OverviewTab />,
				authLevel: 'full',
			},
			{
				path: 'assets',
				element: <AssetsTab />,
				authLevel: 'full',
			},
		],
	},
];

function getAuthLevel(pathname: string): AuthLevel {
	for (const route of routes) {
		if (matchPath(route.path, pathname)) {
			return route.authLevel;
		}
	}
	// Default to full auth for unknown routes
	return 'full';
}

export function AppRouter() {
	const currentAccount = useCurrentAccount();
	const { isCheckingAuth, isCurrentAddressAuthenticated } =
		useApiAuth();
	const location = useLocation();

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

	// Full auth routes - require wallet + API auth
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

	// Wallet-only routes - require wallet but not API auth
	if (authLevel === 'wallet') return renderRoutes;

	if (isCheckingAuth) {
		return <Loading message="Checking authentication..." />;
	}

	if (!isCurrentAddressAuthenticated) {
		return <AuthPrompt />;
	}

	return renderRoutes;
}
