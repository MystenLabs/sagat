// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowUpRight, Download } from 'lucide-react';
import { type ReactNode } from 'react';

import { type AccountSetup } from '@/lib/account-setup';
import { cn } from '@/lib/utils';

import { CreatedBy } from './CreatedBy';

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
		<section
			className={cn(
				'flex flex-col gap-2 rounded-xl border bg-card p-5 md:p-6',
				className,
			)}
			aria-labelledby="account-setup-title"
			data-testid="account-setup"
		>
			<h2
				id="account-setup-title"
				className="text-15 font-medium"
			>
				Setup
			</h2>
			<div className="h-px w-full bg-border" />
			<dl className="flex flex-col gap-1">
				<Row label="Threshold">
					<span
						data-testid="setup-threshold"
						data-threshold={setup.threshold}
						data-total-weight={setup.totalWeight}
					>
						{setup.thresholdLabel}
					</span>
				</Row>
				<Row label="Signers">{setup.signers}</Row>
				<Row label="Total weight">{setup.totalWeight}</Row>
				<Row label="Created">
					<span
						data-testid="setup-created"
						data-created-at={setup.createdAt ?? undefined}
						className={cn(
							!setup.created && 'text-muted-foreground',
						)}
					>
						{setup.created ?? 'Unknown'}
					</span>
				</Row>
				<Row label="Created by">
					<CreatedBy
						creator={setup.creator}
						testId="setup-created-by"
					/>
				</Row>
			</dl>
			<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3">
				{explorerUrl && (
					<a
						href={explorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 rounded-sm text-12 text-foreground-secondary outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
						data-testid="setup-explorer-link"
					>
						View on explorer
						<ArrowUpRight className="size-3" />
					</a>
				)}
				<button
					type="button"
					onClick={onDownload}
					className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-12 text-foreground-secondary outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
					data-testid="setup-download"
				>
					Download setup
					<Download className="size-3" />
				</button>
			</div>
		</section>
	);
}

function Row({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-3 py-0.5 text-13">
			<dt className="shrink-0 text-muted-foreground">
				{label}
			</dt>
			<dd className="min-w-0 truncate text-right">
				{children}
			</dd>
		</div>
	);
}
