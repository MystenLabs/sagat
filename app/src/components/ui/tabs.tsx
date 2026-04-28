// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from '@/lib/utils';

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
	variant?: 'underline' | 'pills';
	className?: string;
}

export function Tabs({
	tabs,
	activeTab,
	onTabChange,
	variant = 'underline',
	className,
}: TabsProps) {
	if (variant === 'pills') {
		return (
			<div
				className={cn(
					'flex gap-2 overflow-x-auto',
					className,
				)}
			>
				{tabs.map((tab) => {
					const isActive = activeTab === tab.id;
					return (
						<button
							key={tab.id}
							type="button"
							onClick={() => onTabChange(tab.id)}
							className={cn(
								'px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer shrink-0',
								isActive
									? 'bg-info-soft text-info-foreground'
									: 'text-muted-foreground hover:bg-accent',
							)}
						>
							{tab.icon}
							{tab.label}
							{tab.count !== undefined && tab.count > 0 && (
								<Label
									variant={isActive ? 'info' : 'neutral'}
									size="sm"
									className="ml-2"
								>
									{tab.count}
								</Label>
							)}
						</button>
					);
				})}
			</div>
		);
	}

	return (
		<div className={cn('border-b', className)}>
			<div className="flex">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
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
