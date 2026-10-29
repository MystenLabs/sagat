// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/ui/page-header';
import { TOOLS, type Tool } from '@/config/tools';

/**
 * Developer tools. One page per tool, reached from the sidebar: a header,
 * then the tool, which renders its own card with the network at the top.
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

	const ToolComponent = selectedTool.component;

	return (
		<div className="page-shell" data-testid="tools-page">
			<PageHeader
				title={selectedTool.name}
				description={selectedTool.description}
			/>
			<ToolComponent />
		</div>
	);
}
