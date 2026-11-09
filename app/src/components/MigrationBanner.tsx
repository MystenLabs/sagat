// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ArrowUpRight,
	ChevronDown,
	ChevronUp,
	Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { cn } from '@/lib/utils';

const PODS_APP_URL = 'https://app.suipods.io';
const MINIMIZED_KEY = 'migration-banner-minimized';

function readMinimized() {
	try {
		return localStorage.getItem(MINIMIZED_KEY) === 'true';
	} catch {
		return false;
	}
}

function writeMinimized(minimized: boolean) {
	try {
		localStorage.setItem(MINIMIZED_KEY, String(minimized));
	} catch {
		// Storage unavailable: the choice lasts until reload.
	}
}

const toggleClass =
	'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-info';

export function MigrationBanner({
	withoutHeader = false,
}: {
	withoutHeader?: boolean;
}) {
	const { pathname } = useLocation();
	const [minimized, setMinimized] = useState(readMinimized);

	const setAndStore = (next: boolean) => {
		setMinimized(next);
		writeMinimized(next);
	};

	const linkProps = {
		href: `${PODS_APP_URL}${pathname}`,
		target: '_blank',
		rel: 'noopener noreferrer',
		'data-testid': 'migration-banner-link',
	};

	return (
		<div
			className={cn(
				'page-shell pt-4',
				withoutHeader && 'pb-4',
			)}
		>
			{minimized ? (
				<div
					className="flex items-center gap-3 rounded-lg border border-info-border bg-info-soft py-1.5 pr-1.5 pl-4 text-sm text-info-foreground"
					data-testid="migration-banner"
				>
					<Sparkles className="size-4 shrink-0" />
					<p className="min-w-0 flex-1">
						Sagat is migrating to Pods.{' '}
						<a
							{...linkProps}
							className="inline-flex cursor-pointer items-center gap-0.5 font-medium whitespace-nowrap underline underline-offset-2"
						>
							Try it now!
							<ArrowUpRight className="size-3.5" />
						</a>
					</p>
					<button
						type="button"
						aria-label="Expand"
						aria-expanded="false"
						onClick={() => setAndStore(false)}
						className={toggleClass}
					>
						<ChevronDown className="size-4" />
					</button>
				</div>
			) : (
				<div
					className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-3 rounded-lg border border-info-border bg-info-soft py-3 pr-3 pl-4 text-sm text-info-foreground sm:grid-cols-[auto_1fr_auto_auto] sm:items-center"
					data-testid="migration-banner"
				>
					<Sparkles className="col-start-1 row-start-1 mt-0.5 size-4 self-start" />
					<div className="col-start-2 row-start-1 min-w-0">
						<p className="font-medium">
							<span className="mr-1.5 inline-flex rounded-full border border-info-border px-2 align-[1px] text-xs leading-4 font-medium">
								Alpha
							</span>{' '}
							Sagat is migrating to Pods, the new home for
							multisigs on Sui.
						</p>
						<p className="mt-0.5">
							Pods is currently in alpha, and all of your
							multisigs and proposal history remain the same
							throughout the migration.
						</p>
					</div>
					<a
						{...linkProps}
						className="col-start-2 row-start-2 inline-flex h-8 cursor-pointer items-center gap-1.5 justify-self-start rounded-md bg-info-foreground px-3 font-medium whitespace-nowrap text-info-soft transition-colors hover:bg-info-foreground/90 sm:col-start-3 sm:row-start-1"
					>
						Try it now!
						<ArrowUpRight className="size-4" />
					</a>
					<button
						type="button"
						aria-label="Minimize"
						aria-expanded="true"
						onClick={() => setAndStore(true)}
						className={`${toggleClass} col-start-3 row-start-1 -mt-1 self-start sm:col-start-4 sm:mt-0 sm:self-center`}
					>
						<ChevronUp className="size-4" />
					</button>
				</div>
			)}
		</div>
	);
}
