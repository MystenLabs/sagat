// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SUI_TYPE_ARG } from '@mysten/sui/utils';
import { Coins } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { SuiLogo } from './SuiLogo';

interface CoinIconProps {
	iconUrl: string | null | undefined;
	symbol?: string | null;
	coinType?: string | null;
	size?: 'sm' | 'md' | 'lg' | 'xl';
	className?: string;
}

const sizeClasses: Record<
	NonNullable<CoinIconProps['size']>,
	{ wrapper: string; icon: string; sui: string }
> = {
	sm: { wrapper: 'w-6 h-6', icon: 'w-3 h-3', sui: 'h-3.5' },
	md: { wrapper: 'w-8 h-8', icon: 'w-4 h-4', sui: 'h-4' },
	lg: { wrapper: 'w-10 h-10', icon: 'w-5 h-5', sui: 'h-5' },
	xl: { wrapper: 'w-12 h-12', icon: 'w-6 h-6', sui: 'h-6' },
};

/**
 * Renders a coin's icon from its on-chain metadata. Falls back to the
 * brand mark for the native SUI coin (whose metadata frequently has no
 * `iconUrl`), and to a generic `Coins` glyph for everything else, so the
 * slot stays consistent even when the image is missing or fails to load.
 */
export function CoinIcon({
	iconUrl,
	symbol,
	coinType,
	size = 'md',
	className,
}: CoinIconProps) {
	const { wrapper, icon, sui } = sizeClasses[size];
	// Track which url last failed to load so a new url is given a fresh chance.
	const [failedUrl, setFailedUrl] = useState<string | null>(
		null,
	);
	const errored = !!iconUrl && failedUrl === iconUrl;
	const isSui = coinType === SUI_TYPE_ARG;

	if (iconUrl && !errored) {
		return (
			<img
				src={iconUrl}
				alt={symbol ?? 'coin'}
				className={cn(
					wrapper,
					'rounded-full object-contain shrink-0',
					className,
				)}
				onError={() => setFailedUrl(iconUrl)}
			/>
		);
	}

	return (
		<div
			className={cn(
				wrapper,
				'rounded-full flex items-center justify-center shrink-0',
				isSui ? 'bg-[#4DA2FF]/10' : 'bg-muted',
				className,
			)}
			aria-label={symbol ? `${symbol} icon` : 'coin icon'}
		>
			{isSui ? (
				<SuiLogo className={cn(sui, 'w-auto')} />
			) : (
				<Coins
					className={cn(icon, 'text-muted-foreground')}
				/>
			)}
		</div>
	);
}
