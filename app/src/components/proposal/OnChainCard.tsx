// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { ExternalLink } from 'lucide-react';

import { ProposalStatusChip } from '@/components/proposals/ProposalStatusChip';
import { buttonVariants } from '@/components/ui/button';
import {
	cardClass,
	CardHeading,
} from '@/components/ui/card';
import { CopyButton } from '@/components/ui/CopyButton';
import { content } from '@/content';
import { formatDateTime } from '@/lib/dates';
import {
	networkLabel,
	type SuiNetwork,
} from '@/lib/network';
import { gasEstimate } from '@/lib/proposal-page';
import { proposalExplorerUrl } from '@/lib/proposalUtils';
import { type ProposalCardInput } from '@/lib/types';
import { cn } from '@/lib/utils';

const COPY = content.proposal.onChain;

/** The executed transaction as read back from the chain. */
export type OnChainTransaction =
	SuiClientTypes.Transaction<{
		effects: true;
	}>;

/**
 * An executed or failed proposal's transaction: how it ended, its
 * digest, and a link to the explorer, which shows the rest now that it
 * is final on chain. `result` is the chain's record, null while it
 * loads, on another network, or when it couldn't be read (`error`).
 */
export function OnChainCard({
	proposal,
	status,
	result,
	error,
}: {
	proposal: ProposalCardInput;
	status: 'executed' | 'failed';
	result: OnChainTransaction | null;
	error: string | null;
}) {
	const explorerUrl = proposalExplorerUrl(status, proposal);
	const confirmedAt = formatDateTime(
		result?.timestampMs ?? null,
	);
	const gasUsed = gasEstimate(result);

	return (
		<section
			className={cn(cardClass, 'self-start')}
			aria-labelledby="on-chain-heading"
			data-testid="proposal-on-chain"
			data-status={status}
		>
			<CardHeading
				id="on-chain-heading"
				title={COPY.heading}
			/>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				<ProposalStatusChip status={status} />
				{(confirmedAt || gasUsed) && (
					<span className="text-12 text-muted-foreground">
						{[confirmedAt, gasUsed && COPY.gas(gasUsed)]
							.filter(Boolean)
							.join(' · ')}
					</span>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted px-3.5 py-2.5">
				<span className="text-13 text-muted-foreground">
					{content.common.fields.digest}
				</span>
				<span className="ml-auto flex min-w-0 items-center gap-1.5">
					<span
						className="min-w-0 font-mono text-12 break-all"
						data-testid="proposal-on-chain-digest"
					>
						{proposal.digest}
					</span>
					<CopyButton
						value={proposal.digest}
						size="inline"
						successMessage={content.toasts.digestCopied}
					/>
				</span>
			</div>
			{error !== null && (
				<p className="text-12 text-muted-foreground">
					{COPY.loadFailed(error)}
				</p>
			)}
			{explorerUrl ? (
				<a
					href={explorerUrl}
					target="_blank"
					rel="noopener noreferrer"
					className={cn(
						buttonVariants({ variant: 'outline' }),
						'w-fit',
					)}
					data-testid="view-on-explorer"
				>
					<ExternalLink />
					{content.common.actions.viewOnExplorer}
				</a>
			) : (
				<p className="text-12 text-muted-foreground">
					{COPY.noExplorer(
						networkLabel(proposal.network as SuiNetwork),
					)}
				</p>
			)}
		</section>
	);
}
