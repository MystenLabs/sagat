// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from '@/lib/utils';

export interface Tab {
	id: string;
	label: string;
	icon?: React.ReactNode;
	count?: number;
}

interface TabsProps {
	tabs: Tab[];
	activeTab: string;
	onTabChange: (tabId: string) => void;
	className?: string;
	/** Each tab button gets `data-testid="<testId>-<tab.id>"`. */
	testId?: string;
}

/**
 * Filter tabs as pills: the active one is black with white text, the others
 * white, and a count above zero sits in a round badge of the opposite colours.
 */
export function Tabs({
	tabs,
	activeTab,
	onTabChange,
	className,
	testId,
}: TabsProps) {
	const tabTestId = (id: string) =>
		testId ? `${testId}-${id}` : undefined;

	return (
		<div
			className={cn(
				'flex gap-1.5 overflow-x-auto',
				className,
			)}
		>
			{tabs.map((tab) => {
				const isActive = activeTab === tab.id;
				return (
					<button
						key={tab.id}
						type="button"
						data-testid={tabTestId(tab.id)}
						data-active={isActive || undefined}
						data-count={tab.count}
						onClick={() => onTabChange(tab.id)}
						className={cn(
							'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-13 transition-colors',
							isActive
								? 'bg-primary font-medium text-primary-foreground'
								: 'bg-card text-foreground hover:bg-accent',
						)}
					>
						{tab.icon}
						{tab.label}
						{tab.count !== undefined && tab.count > 0 && (
							<span
								className={cn(
									'inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-0.5 text-11 font-medium tabular-nums',
									isActive
										? 'bg-primary-foreground text-primary'
										: 'bg-primary text-primary-foreground',
								)}
							>
								{tab.count}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
