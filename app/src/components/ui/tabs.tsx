// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Label } from './label';

export interface Tab {
	id: string;
	label: string;
	icon?: React.ReactNode;
	count?: number;
	countColor?: 'blue' | 'orange' | 'gray';
}

interface TabsProps {
	tabs: Tab[];
	activeTab: string;
	onTabChange: (tabId: string) => void;
}

export function Tabs({
	tabs,
	activeTab,
	onTabChange,
}: TabsProps) {
	return (
		<div className="border-b">
			<div className="flex">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						onClick={() => onTabChange(tab.id)}
						className={`flex cursor-pointer items-center gap-2 border-b-2 py-3 px-3 text-sm font-medium transition-colors ${
							activeTab === tab.id
								? 'border-info-border text-info-foreground'
								: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
						}`}
					>
						{tab.icon}
						{tab.label}
						{tab.count !== undefined && tab.count > 0 && (
							<Label
								variant={
									tab.countColor === 'orange'
										? 'warning'
										: tab.countColor === 'gray'
											? 'neutral'
											: 'info'
								}
								size="sm"
								className="ml-2"
							>
								{tab.count}
							</Label>
						)}
					</button>
				))}
			</div>
		</div>
	);
}
