// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowUpRight, Download } from 'lucide-react';
import { type ReactNode } from 'react';

import { content } from '@/content';
import { type AccountSetup } from '@/lib/account-setup';
import { cn } from '@/lib/utils';

import { Button, buttonVariants } from '../ui/button';
import { cardClass, CardHeading } from '../ui/card';
import { Separator } from '../ui/separator';
import { CreatedBy } from './CreatedBy';

const FIELDS = content.common.fields;
const COPY = content.overview.setup;

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
		<section
			className={cn(cardClass, 'gap-2', className)}
			aria-labelledby="account-setup-title"
			data-testid="account-setup"
		>
			<CardHeading
				id="account-setup-title"
				title={COPY.title}
			/>
			<Separator />
			<dl className="flex flex-col gap-1">
				<Row label={FIELDS.threshold}>
					<span
						data-testid="setup-threshold"
						data-threshold={setup.threshold}
						data-total-weight={setup.totalWeight}
					>
						{setup.thresholdLabel}
					</span>
				</Row>
				<Row label={FIELDS.signers}>
					<span data-testid="setup-signers">
						{setup.signerCount}
					</span>
				</Row>
				<Row label={FIELDS.totalWeight}>
					{setup.totalWeight}
				</Row>
				<Row label={COPY.created}>
					<span
						data-testid="setup-created"
						data-created-at={setup.createdAt ?? undefined}
						className={cn(
							!setup.createdLabel &&
								'text-muted-foreground',
						)}
					>
						{setup.createdLabel ?? COPY.createdUnknown}
					</span>
				</Row>
				<Row label={COPY.createdBy}>
					<CreatedBy
						creator={setup.creator}
						testId="setup-created-by"
					/>
				</Row>
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
						{content.common.actions.viewOnExplorer}
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
					{COPY.download}
					<Download className="size-3" />
				</Button>
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
