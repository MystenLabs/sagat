// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/ui/page-header';
import { Tabs, type Tab } from '@/components/ui/tabs';
import { TOOLS, type Tool } from '@/config/tools';

/**
 * Developer tools. One page per tool, switched with pills under a shared
 * header; the tool itself renders inside a card. Tools that talk to the
 * chain place the network picker next to the action it affects.
 */
export function ToolsPage() {
	const location = useLocation();
	const navigate = useNavigate();

	const currentPath = location.pathname;
	const selectedTool = TOOLS.find(
		(tool: Tool) => tool.path === currentPath,
	);

	// /tools and unknown tool paths land on the first tool.
	useEffect(() => {
		if (
			currentPath === '/tools' ||
			(currentPath.startsWith('/tools') && !selectedTool)
		) {
			if (TOOLS.length > 0) {
				navigate(TOOLS[0].path, { replace: true });
			}
		}
	}, [currentPath, selectedTool, navigate]);

	if (!selectedTool) return null;

	const tabs: Tab[] = TOOLS.map((tool: Tool) => ({
		id: tool.path,
		label: tool.name,
		icon: tool.icon,
	}));
	const ToolComponent = selectedTool.component;

	return (
		<div className="page-shell" data-testid="tools-page">
			<PageHeader
				breadcrumb={[
					{ label: 'Developer tools', to: '/tools' },
					{ label: selectedTool.name },
				]}
				title={selectedTool.name}
				description={selectedTool.description}
			/>

			<Tabs
				tabs={tabs}
				activeTab={currentPath}
				onTabChange={navigate}
				variant="pills"
				testId="tools-tab"
			/>

			<div className="mt-6 rounded-xl border bg-card p-6">
				<ToolComponent />
			</div>
		</div>
	);
}
