// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	Check,
	ChevronRight,
	Monitor,
	Moon,
	Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';

import {
	railSquareClass,
	railTriggerClass,
} from '@/components/shell/rail-classes';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { content } from '@/content';
import { cn } from '@/lib/utils';

const OPTIONS = [
	{
		value: 'light',
		icon: Sun,
		label: content.shell.theme.light,
	},
	{
		value: 'dark',
		icon: Moon,
		label: content.shell.theme.dark,
	},
	{
		value: 'system',
		icon: Monitor,
		label: content.shell.theme.system,
	},
] as const;

/**
 * Light / dark / system picker. The `icon` variant is a bare icon button
 * (mobile header); the `row` variant is a full sidebar footer row that
 * shrinks to its icon on the collapsed rail.
 */
export function ThemeToggle({
	variant = 'icon',
	className,
}: {
	variant?: 'icon' | 'row';
	className?: string;
}) {
	const { theme, setTheme } = useTheme();
	const active =
		OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];
	const ActiveIcon = active.icon;
	const row = variant === 'row';

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={content.shell.theme.ariaLabel(
					active.label,
				)}
				data-testid="theme-toggle"
				className={cn(
					'items-center rounded-md data-open:bg-sidebar-accent',
					railTriggerClass,
					row && railSquareClass,
					row
						? 'flex h-8 w-full gap-2 p-2 text-left'
						: 'inline-flex size-7 shrink-0 justify-center',
					className,
				)}
			>
				<ActiveIcon className="size-4 shrink-0" />
				{row && (
					<>
						<span className="flex-1 group-data-[collapsible=icon]:hidden">
							{content.shell.theme.label}
						</span>
						<span className="text-11 opacity-60 group-data-[collapsible=icon]:hidden">
							{active.label}
						</span>
						<ChevronRight className="size-3 opacity-60 group-data-[collapsible=icon]:hidden" />
					</>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side={row ? 'top' : 'bottom'}
				align={row ? 'start' : 'end'}
				className="min-w-36"
			>
				<DropdownMenuGroup>
					<DropdownMenuLabel>
						{content.shell.theme.label}
					</DropdownMenuLabel>
					{OPTIONS.map(({ value, icon: Icon, label }) => (
						<DropdownMenuItem
							key={value}
							onClick={() => setTheme(value)}
							data-testid="theme-option"
							data-theme={value}
							data-current={theme === value}
						>
							<Icon />
							{label}
							{theme === value && (
								<Check className="ml-auto size-4" />
							)}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
