// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { LucideLock } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

interface LogoProps {
	showSubtitle?: boolean;
	size?: 'sm' | 'md' | 'lg';
	asLink?: boolean;
	/** Only the icon tile, for the collapsed sidebar. */
	compact?: boolean;
	/** White treatment regardless of theme, for dark surfaces like the sidebar. */
	onDark?: boolean;
}

export function Logo({
	showSubtitle = true,
	size = 'md',
	asLink = true,
	compact = false,
	onDark = false,
}: LogoProps) {
	const sizeClasses = {
		sm: {
			icon: 'w-4 h-4',
			iconPadding: 'p-1.5',
			text: 'text-lg',
			subtitle: 'text-xs',
		},
		md: {
			icon: 'w-5 h-5',
			iconPadding: 'p-2',
			text: 'text-xl',
			subtitle: 'text-xs',
		},
		lg: {
			icon: 'w-6 h-6',
			iconPadding: 'p-2.5',
			text: 'text-2xl',
			subtitle: 'text-sm',
		},
	};

	const classes = sizeClasses[size];
	const tile = onDark
		? 'bg-white'
		: 'bg-linear-to-br from-blue-500 to-purple-500 dark:from-white dark:to-white';
	const glyph = onDark
		? 'text-black'
		: 'text-white dark:text-black';
	const wordmark = onDark
		? 'text-white'
		: 'bg-linear-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent dark:text-white';

	const logoContent = (
		<div className="flex items-center gap-2">
			<div
				className={cn(
					'relative rounded-lg shadow-sm',
					classes.iconPadding,
					tile,
				)}
			>
				<LucideLock className={cn(classes.icon, glyph)} />
			</div>
			{!compact && (
				<div className="flex flex-col">
					<span
						className={cn(
							classes.text,
							'font-bold tracking-tight',
							wordmark,
						)}
					>
						SAGAT
					</span>
					{showSubtitle && (
						<span
							className={cn(
								classes.subtitle,
								'-mt-0.5',
								onDark
									? 'text-white/60'
									: 'text-muted-foreground',
							)}
						>
							Sui Multisig Manager
						</span>
					)}
				</div>
			)}
		</div>
	);

	if (asLink) {
		return (
			<Link to="/" className="group">
				{logoContent}
			</Link>
		);
	}

	return <div className="group">{logoContent}</div>;
}
