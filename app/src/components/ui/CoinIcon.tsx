// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Check, Coins } from 'lucide-react';
import { useState } from 'react';

import { isSuiCoinType } from '@/lib/coins';
import { cn } from '@/lib/utils';

import { SuiLogo } from './SuiLogo';

interface CoinIconProps {
	iconUrl: string | null | undefined;
	symbol?: string | null;
	coinType?: string | null;
	recognized?: boolean;
	size?: 'sm' | 'md' | 'lg' | 'xl';
	className?: string;
}

const sizeClasses: Record<
	NonNullable<CoinIconProps['size']>,
	{
		wrapper: string;
		icon: string;
		sui: string;
		badge: string;
		badgeIcon: string;
	}
> = {
	sm: {
		wrapper: 'w-6 h-6',
		icon: 'w-3 h-3',
		sui: 'h-3.5',
		badge: 'w-3 h-3 -right-0.5 -top-0.5',
		badgeIcon: 'w-2 h-2',
	},
	md: {
		wrapper: 'w-8 h-8',
		icon: 'w-4 h-4',
		sui: 'h-4',
		badge: 'w-3.5 h-3.5 -right-0.5 -top-0.5',
		badgeIcon: 'w-2 h-2',
	},
	lg: {
		wrapper: 'w-10 h-10',
		icon: 'w-5 h-5',
		sui: 'h-5',
		badge: 'w-4 h-4 -right-0.5 -top-0.5',
		badgeIcon: 'w-2.5 h-2.5',
	},
	xl: {
		wrapper: 'w-12 h-12',
		icon: 'w-6 h-6',
		sui: 'h-6',
		badge: 'w-4 h-4 -right-0.5 -top-0.5',
		badgeIcon: 'w-2.5 h-2.5',
	},
};

function RecognizedBadge({
	badgeClassName,
	iconClassName,
}: {
	badgeClassName: string;
	iconClassName: string;
}) {
	return (
		<span
			className={cn(
				'absolute rounded-full bg-emerald-600 text-white ring-1 ring-background border border-emerald-300/80 flex items-center justify-center shadow-sm',
				badgeClassName,
			)}
			title="Recognized coin"
			aria-label="Recognized coin"
		>
			<Check strokeWidth={3} className={iconClassName} />
		</span>
	);
}

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
	recognized = false,
	size = 'md',
	className,
}: CoinIconProps) {
	const { wrapper, icon, sui, badge, badgeIcon } =
		sizeClasses[size];
	// Track which url last failed to load so a new url is given a fresh chance.
	const [failedUrl, setFailedUrl] = useState<string | null>(
		null,
	);
	const errored = !!iconUrl && failedUrl === iconUrl;
	const isSui = isSuiCoinType(coinType);

	if (isSui) {
		return (
			<div
				className={cn(
					'relative',
					wrapper,
					'rounded-full flex items-center justify-center shrink-0 bg-[#4DA2FF]/10',
					className,
				)}
				aria-label={symbol ? `${symbol} icon` : 'coin icon'}
			>
				<SuiLogo className={cn(sui, 'w-auto')} />
				{recognized && (
					<RecognizedBadge
						badgeClassName={badge}
						iconClassName={badgeIcon}
					/>
				)}
			</div>
		);
	}

	if (iconUrl && !errored) {
		return (
			<div className={cn('relative shrink-0', className)}>
				<img
					src={iconUrl}
					alt={symbol ?? 'coin'}
					className={cn(
						wrapper,
						'rounded-full object-contain',
					)}
					onError={() => setFailedUrl(iconUrl)}
				/>
				{recognized && (
					<RecognizedBadge
						badgeClassName={badge}
						iconClassName={badgeIcon}
					/>
				)}
			</div>
		);
	}

	return (
		<div
			className={cn(
				'relative',
				wrapper,
				'rounded-full flex items-center justify-center shrink-0',
				'bg-muted',
				className,
			)}
			aria-label={symbol ? `${symbol} icon` : 'coin icon'}
		>
			<Coins
				className={cn(icon, 'text-muted-foreground')}
			/>
			{recognized && (
				<RecognizedBadge
					badgeClassName={badge}
					iconClassName={badgeIcon}
				/>
			)}
		</div>
	);
}
