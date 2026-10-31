// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from '@/lib/utils';

import { Chip } from './chip';

export interface Tab {
	id: string;
	label: string;
	icon?: React.ReactNode;
	count?: number;
	countColor?: 'gray' | 'orange';
}

interface TabsProps {
	tabs: Tab[];
	activeTab: string;
	onTabChange: (tabId: string) => void;
	variant?: 'underline' | 'pills';
	className?: string;
	/** Each tab button gets `data-testid="<testId>-<tab.id>"`. */
	testId?: string;
}

/**
 * Filter tabs. `pills` is the redesign's segmented filter: the active pill
 * is black with white text, the others white, and a count above zero sits
 * in a round badge of the opposite colours. `underline` is the quieter
 * in-page variant, neutral as well.
 */
export function Tabs({
	tabs,
	activeTab,
	onTabChange,
	variant = 'underline',
	className,
	testId,
}: TabsProps) {
	const tabTestId = (id: string) =>
		testId ? `${testId}-${id}` : undefined;

	if (variant === 'pills') {
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

	return (
		<div className={cn('border-b', className)}>
			<div className="flex">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						data-testid={tabTestId(tab.id)}
						data-active={activeTab === tab.id || undefined}
						data-count={tab.count}
						onClick={() => onTabChange(tab.id)}
						className={cn(
							'-mb-px flex cursor-pointer items-center gap-2 border-b-2 px-3 py-3 text-13 font-medium transition-colors',
							activeTab === tab.id
								? 'border-foreground text-foreground'
								: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
						)}
					>
						{tab.icon}
						{tab.label}
						{tab.count !== undefined && tab.count > 0 && (
							<Chip
								variant={
									tab.countColor === 'orange'
										? 'warning'
										: 'neutral'
								}
								size="sm"
								className="ml-1"
							>
								{tab.count}
							</Chip>
						)}
					</button>
				))}
			</div>
		</div>
	);
}
