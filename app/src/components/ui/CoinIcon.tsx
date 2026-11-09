// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	Check,
	CircleAlert,
	CircleCheck,
	Coins,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { content } from '@/content';
import { isSuiCoinType } from '@/lib/coins';
import { cn } from '@/lib/utils';

import {
	Popover,
	PopoverArrow,
	PopoverContent,
	PopoverTrigger,
} from './popover';
import { SuiLogo } from './SuiLogo';
import {
	tooltipArrowClass,
	tooltipPopupClass,
} from './tooltip';

const COPY = content.shell.controls;
const MARKS = content.assets.tokens;

interface CoinIconProps {
	iconUrl: string | null | undefined;
	symbol?: string | null;
	coinType?: string | null;
	recognized?: boolean;
	/** The check badge on a recognized coin's icon; off where a row marks it. */
	badge?: boolean;
	/** In the badge's place: a check when true, a warning when false. */
	verified?: boolean;
	size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
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
	xs: {
		wrapper: 'w-5 h-5',
		icon: 'w-2.5 h-2.5',
		sui: 'h-3',
		badge: 'w-2.5 h-2.5 -right-0.5 -top-0.5',
		badgeIcon: 'w-1.5 h-1.5',
	},
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
				'absolute rounded-full bg-success-foreground text-primary-foreground ring-1 ring-background border border-success-border flex items-center justify-center',
				badgeClassName,
			)}
			title={COPY.recognizedCoin}
			aria-label={COPY.recognizedCoin}
		>
			<Check strokeWidth={3} className={iconClassName} />
		</span>
	);
}

function VerifiedBadge({
	verified,
	badgeClassName,
}: {
	verified: boolean;
	badgeClassName: string;
}) {
	if (verified)
		return (
			<CircleCheck
				className={cn(
					'absolute fill-foreground text-background',
					badgeClassName,
				)}
				role="img"
				aria-label={MARKS.verified}
				data-testid="token-verified"
			/>
		);
	// A popover, not a tooltip, so a tap opens it too.
	return (
		<Popover>
			<PopoverTrigger
				openOnHover
				delay={150}
				aria-label={MARKS.unverifiedCoin}
				data-testid="token-unverified"
				className={cn(
					'absolute cursor-help rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring',
					badgeClassName,
				)}
			>
				<CircleAlert
					className="size-full fill-warning-solid text-warning-foreground"
					aria-hidden
				/>
			</PopoverTrigger>
			<PopoverContent
				side="top"
				initialFocus={false}
				finalFocus={false}
				data-testid="token-unverified-popup"
				className={cn(
					tooltipPopupClass,
					'ring-0 duration-150',
				)}
			>
				{MARKS.unverifiedCoin}
				<PopoverArrow className={tooltipArrowClass} />
			</PopoverContent>
		</Popover>
	);
}

/**
 * Renders a coin's icon. The brand mark stands for SUI; a recognized
 * coin shows the registry's icon; every other coin, or an icon that fails
 * to load, gets a generic `Coins` glyph. An unrecognized coin's URL is
 * never loaded: its issuer chose it, and fetching it would tell the
 * issuer's server who views the pod.
 */
export function CoinIcon({
	iconUrl: givenUrl,
	symbol,
	coinType,
	recognized = false,
	badge: showBadge = true,
	verified,
	size = 'md',
	className,
}: CoinIconProps) {
	const { wrapper, icon, sui, badge, badgeIcon } =
		sizeClasses[size];
	const iconUrl = recognized ? givenUrl : null;
	let badgeNode: ReactNode = null;
	if (verified !== undefined)
		badgeNode = (
			<VerifiedBadge
				verified={verified}
				badgeClassName={badge}
			/>
		);
	else if (recognized && showBadge)
		badgeNode = (
			<RecognizedBadge
				badgeClassName={badge}
				iconClassName={badgeIcon}
			/>
		);
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
					'rounded-full flex items-center justify-center shrink-0 bg-sui/10',
					className,
				)}
				aria-label={COPY.coinIcon(symbol)}
			>
				<SuiLogo className={cn(sui, 'w-auto')} />
				{badgeNode}
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
				{badgeNode}
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
			aria-label={COPY.coinIcon(symbol)}
		>
			<Coins
				className={cn(icon, 'text-muted-foreground')}
			/>
			{badgeNode}
		</div>
	);
}
