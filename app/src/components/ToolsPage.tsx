import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Tabs, type Tab } from '@/components/ui/tabs';
import { TOOLS, type Tool } from '@/config/tools';

function ToolDetail({ tool }: { tool: Tool }) {
	const ToolComponent = tool.component;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<div className="p-2 bg-blue-100 rounded-lg">
					{tool.icon}
				</div>
				<div>
					<h2 className="text-2xl font-bold">
						{tool.name}
					</h2>
					<p className="text-gray-600 text-sm">
						{tool.description}
					</p>
				</div>
			</div>

			<div className="border rounded-lg p-6">
				<ToolComponent />
			</div>
		</div>
	);
}

function ToolsNavigation({
	currentPath,
	onNavigate,
}: {
	currentPath: string;
	onNavigate: (path: string) => void;
}) {
	const tabs: Tab[] = TOOLS.map((tool: Tool) => ({
		id: tool.path,
		label: tool.name,
		icon: tool.icon,
	}));

	return (
		<div className="mb-8">
			<Tabs
				tabs={tabs}
				activeTab={currentPath}
				onTabChange={onNavigate}
			/>
		</div>
	);
}

export function ToolsPage() {
	const location = useLocation();
	const navigate = useNavigate();

	// Detect active tool from URL path
	const currentPath = location.pathname;
	const selectedTool = TOOLS.find(
		(tool: Tool) => tool.path === currentPath,
	);

	// Redirect to first tool if on /tools or invalid path
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

	// Don't render until we have a valid tool selected
	if (!selectedTool) return null;

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="mb-8">
				<h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">
					Developer Tools
				</h1>
			</div>

			<ToolsNavigation
				currentPath={currentPath}
				onNavigate={navigate}
			/>

			<ToolDetail tool={selectedTool} />
		</div>
	);
}
