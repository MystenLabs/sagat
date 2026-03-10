// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { LucideLock } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LogoProps {
	showSubtitle?: boolean;
	size?: 'sm' | 'md' | 'lg';
	asLink?: boolean;
}

export function Logo({
	showSubtitle = true,
	size = 'md',
	asLink = true,
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

	const logoContent = (
		<div className="flex items-center gap-2">
			<div className="relative">
				<div className="absolute inset-0 bg-linear-to-br from-blue-600 to-purple-600 dark:from-white dark:to-white rounded-lg opacity-90 group-hover:opacity-100 transition-opacity"></div>
				<div
					className={`relative bg-linear-to-br from-blue-500 to-purple-500 dark:from-white dark:to-white ${classes.iconPadding} rounded-lg shadow-sm`}
				>
					<LucideLock
						className={`${classes.icon} text-white dark:text-black`}
					/>
				</div>
			</div>
			<div className="flex flex-col">
				<span
					className={`${classes.text} font-bold bg-linear-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent dark:text-white`}
				>
					SAGAT
				</span>
				{showSubtitle && (
					<span
						className={`${classes.subtitle} text-muted-foreground -mt-0.5`}
					>
						Sui Multisig Manager
					</span>
				)}
			</div>
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
