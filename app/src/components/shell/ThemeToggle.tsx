// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const OPTIONS = [
	{ value: 'light', icon: Sun, label: 'Light' },
	{ value: 'dark', icon: Moon, label: 'Dark' },
	{ value: 'system', icon: Monitor, label: 'System' },
] as const;

/** Light / dark / system picker for the sidebar header. */
export function ThemeToggle({
	className,
}: {
	className?: string;
}) {
	const { theme, setTheme } = useTheme();
	const active =
		OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];
	const ActiveIcon = active.icon;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`Theme: ${active.label}`}
				data-testid="theme-toggle"
				className={cn(
					'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-open:bg-sidebar-accent',
					className,
				)}
			>
				<ActiveIcon className="size-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-36">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Theme</DropdownMenuLabel>
					{OPTIONS.map(({ value, icon: Icon, label }) => (
						<DropdownMenuItem
							key={value}
							onClick={() => setTheme(value)}
							className={cn(theme === value && 'bg-accent')}
						>
							<Icon />
							{label}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
