// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChevronDown, Wrench } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { TOOLS } from '@/config/tools';

interface ToolsDropdownProps {
	mobile?: boolean;
	onNavigate?: () => void;
}

export function ToolsDropdown({
	mobile = false,
	onNavigate,
}: ToolsDropdownProps) {
	const location = useLocation();
	const isToolsActive =
		location.pathname.startsWith('/tools');

	if (mobile) {
		return (
			<>
				{TOOLS.map((tool) => (
					<Link
						key={tool.id}
						to={tool.path}
						onClick={onNavigate}
					>
						<Button
							variant={
								location.pathname === tool.path
									? 'default'
									: 'outline'
							}
							size="default"
							className="w-full justify-start"
						>
							<span className="w-4 h-4 mr-2">
								{tool.icon}
							</span>
							{tool.name}
						</Button>
					</Link>
				))}
			</>
		);
	}

	return (
		<div className="relative group">
			<Button
				variant={isToolsActive ? 'default' : 'outline'}
				size="sm"
				className="flex items-center gap-2"
			>
				<Wrench className="w-4 h-4" />
				Tools
				<ChevronDown className="w-4 h-4" />
			</Button>

			{/* Dropdown menu */}
			<div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
				<div className="p-2">
					<div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
						Developer Tools
					</div>
					{TOOLS.map((tool) => (
						<Link
							key={tool.id}
							to={tool.path}
							className={`block px-3 py-2 rounded-md text-sm transition-colors ${
								location.pathname === tool.path
									? 'bg-blue-100 text-blue-900'
									: 'text-gray-700 hover:bg-gray-100'
							}`}
						>
							<div className="font-medium">{tool.name}</div>
							<div className="text-xs text-gray-500 mt-0.5">
								{tool.headerDescription}
							</div>
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}
