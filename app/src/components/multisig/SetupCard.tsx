// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowUpRight, Download } from 'lucide-react';

import { type AccountSetup } from '@/lib/account-setup';
import { cn } from '@/lib/utils';

import { Button, buttonVariants } from '../ui/button';
import { Card } from '../ui/card';
import { DetailRow } from '../ui/detail-row';
import { Separator } from '../ui/separator';
import { CreatedBy } from './CreatedBy';

/** The explorer link and the download button: quiet text actions. */
const textAction =
	'h-auto gap-1 border-0 px-0 text-12 font-normal text-foreground-secondary hover:text-foreground hover:no-underline';

/**
 * The "Setup" card beside the signers: the account's numbers, when and by
 * whom it was created, and the two text actions the old overview had.
 */
export function SetupCard({
	setup,
	explorerUrl,
	onDownload,
	className,
}: {
	setup: AccountSetup;
	/** Null where the explorer doesn't index the network. */
	explorerUrl: string | null;
	onDownload: () => void;
	className?: string;
}) {
	return (
		<Card
			title="Setup"
			titleId="account-setup-title"
			className={cn('gap-2', className)}
			testId="account-setup"
		>
			<Separator />
			<dl className="flex flex-col gap-1">
				<DetailRow label="Threshold">
					<span
						data-testid="setup-threshold"
						data-threshold={setup.threshold}
						data-total-weight={setup.totalWeight}
					>
						{setup.thresholdLabel}
					</span>
				</DetailRow>
				<DetailRow label="Signers">
					<span data-testid="setup-signers">
						{setup.signerCount}
					</span>
				</DetailRow>
				<DetailRow label="Total weight">
					{setup.totalWeight}
				</DetailRow>
				<DetailRow label="Created">
					<span
						data-testid="setup-created"
						data-created-at={setup.createdAt ?? undefined}
						className={cn(
							!setup.createdLabel &&
								'text-muted-foreground',
						)}
					>
						{setup.createdLabel ?? 'Unknown'}
					</span>
				</DetailRow>
				<DetailRow label="Created by">
					<CreatedBy
						creator={setup.creator}
						testId="setup-created-by"
					/>
				</DetailRow>
			</dl>
			<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3">
				{explorerUrl && (
					// Styled as the button, not rendered through it: Base UI
					// would give the anchor role="button".
					<a
						href={explorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						className={cn(
							buttonVariants({
								variant: 'link',
								size: 'xs',
							}),
							textAction,
						)}
						data-testid="setup-explorer-link"
					>
						View on explorer
						<ArrowUpRight className="size-3" />
					</a>
				)}
				<Button
					variant="link"
					size="xs"
					onClick={onDownload}
					className={textAction}
					data-testid="setup-download"
				>
					Download setup
					<Download className="size-3" />
				</Button>
			</div>
		</Card>
	);
}
