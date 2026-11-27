// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	Download,
	ExternalLink,
	FileText,
	Link2,
	MoreHorizontal,
} from 'lucide-react';
import { type ReactElement, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useExecuteOrVerify } from '@/hooks/useExecuteProposal';
import { type AliasRead } from '@/lib/alias-set';
import { formatShortDate } from '@/lib/dates';
import {
	buildProposalExport,
	downloadJson,
	getProposalExportFilename,
} from '@/lib/exportUtils';
import { listedStatus } from '@/lib/proposal-page';
import {
	canExportProposal,
	isExternalProposer,
	proposalExplorerUrl,
	proposalLinkUrl,
	proposalPagePath,
	proposalStatusKey,
	proposalTitle,
	rowExecuteSet,
	shortDigest,
	shownSignerSet,
	type CountedProposal,
} from '@/lib/proposalUtils';
import { cn } from '@/lib/utils';

import { SignerName } from '../multisig/SignerName';
import { Button, buttonVariants } from '../ui/button';
import { CopyButton } from '../ui/CopyButton';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { tableRowClass } from '../ui/table';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../ui/tooltip';
import { ProposalExpiry } from './ProposalExpiry';
import { ProposalStatusChip } from './ProposalStatusChip';
import { ProposalWeight } from './ProposalWeight';

const ACTIONS = content.common.actions;
const COPY = content.proposals.row;
const SHARED = content.proposal.shared;

export type ProposalsTableVariant = 'overview' | 'list';

/**
 * One proposal in the proposals table: what it is, who proposed it,
 * where it stands and Execute. The row opens the proposal's page,
 * where signing and cancelling happen. The overview names the proposer
 * in the meta line; the list gives them a column, and adds the digest
 * and a menu to copy its link, download it, unless cancelled or expired,
 * or look it up on the explorer.
 */
export function ProposalRow({
	proposal,
	variant,
	expired,
	proposerLabel,
	aliases,
}: {
	proposal: CountedProposal;
	variant: ProposalsTableVariant;
	/** Still pending, but past its last epoch. */
	expired: boolean;
	/** The proposer's key label, when they are a labelled signer. */
	proposerLabel: string | null;
	/** The pod's alias read, to check a signer change as its page does. */
	aliases: AliasRead | undefined;
}) {
	const { currentAddress } = useApiAuth();
	const executing = useExecuteOrVerify();
	const navigate = useNavigate();

	const status = expired
		? 'expired'
		: proposalStatusKey(proposal);
	const shown = listedStatus(proposal, status, aliases);
	const pending = proposal.status === 'PENDING';
	const signed =
		pending &&
		!!currentAddress &&
		proposal.signatures.some(
			(sig) => sig.publicKey === currentAddress.publicKey,
		);
	const explorerUrl = proposalExplorerUrl(status, proposal);
	const shownSet = shownSignerSet(
		proposal.checkedSignerSets,
	);
	const readySet =
		status === 'ready' ? rowExecuteSet(proposal) : null;
	const list = variant === 'list';
	const createdOn = formatShortDate(proposal.createdAt);
	// The digest goes under the title, unless the title already is the
	// digest (no description). The overview's column is too narrow for it,
	// but its stacked rows have room.
	const showDigest = !!proposal.description?.trim();
	// A signer goes by their key's label. An outside proposer has none, so
	// goes by address, marked as such.
	const proposerMarker =
		proposal.proposerAddress === currentAddress?.address
			? 'you'
			: isExternalProposer(proposal)
				? 'external'
				: null;
	const pagePath = proposalPagePath(
		proposal.accountAddress,
		proposal.digest,
	);

	return (
		<tr
			onClick={(e) => {
				const target = e.target as Element;
				// Menu items are portalled, so they reach here through React only.
				if (
					e.currentTarget.contains(target) &&
					!target.closest('a, button') &&
					!executing.isPending &&
					// Releasing a text selection is not a click on the row.
					!window.getSelection()?.toString()
				)
					navigate(pagePath);
			}}
			className={cn(
				tableRowClass,
				'cursor-pointer hover:bg-muted/50',
				'@max-md:grid @max-md:grid-cols-[auto_auto_1fr] @max-md:gap-x-3 @max-md:gap-y-2 @max-md:px-3 @max-md:py-3',
			)}
			data-testid="proposal-row"
			data-digest={proposal.digest}
			data-status={status}
		>
			<td className="px-3 py-2.75 @max-md:col-span-3 @max-md:block @max-md:p-0">
				<div className="flex min-w-0 items-center gap-3">
					{variant === 'overview' && (
						// The kind of proposal isn't decoded yet, so one icon for all.
						<span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground-secondary sm:flex">
							<FileText className="size-4" />
						</span>
					)}
					<div className="flex min-w-0 flex-col gap-0.75">
						<Link
							to={pagePath}
							className="truncate text-14 font-medium text-foreground hover:underline @max-md:line-clamp-2 @max-md:whitespace-normal"
							data-testid="proposal-title"
						>
							{proposalTitle(proposal)}
						</Link>
						{/* The proposer leads the meta line and each item
							    after it brings its own "·". In the list's table
							    layout the proposer is display:none, so the item
							    after it drops its dot. */}
						<span
							className={cn(
								'flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-12 text-muted-foreground',
								list &&
									'@md:[&>:nth-child(2)>[aria-hidden]:first-child]:hidden',
							)}
						>
							{/* The list renders the proposer twice: here for the
								    stacked layout and in its own column for the table.
								    One is always display:none, and only the column
								    carries the test id, so each row has one. */}
							<span
								className={cn(
									'inline-flex min-w-0 items-center gap-1',
									list && '@md:hidden',
								)}
								data-testid={
									list ? undefined : 'proposal-proposer'
								}
							>
								{SHARED.proposedBy}{' '}
								{/* The name alone; the address only when unnamed. */}
								<SignerName
									label={proposerLabel}
									address={
										proposerLabel
											? undefined
											: proposal.proposerAddress
									}
									marker={proposerMarker}
									markerStyle="parens"
									size="inline"
								/>
							</span>
							{showDigest && (
								<span
									className={cn(
										'inline-flex items-center gap-1 whitespace-nowrap',
										!list && '@md:hidden',
									)}
								>
									<span aria-hidden className="mr-0.5">
										·
									</span>
									<span className="font-mono">
										{shortDigest(proposal.digest)}
									</span>
									<CopyButton
										value={proposal.digest}
										size="inline"
										successMessage={
											content.toasts.digestCopied
										}
									/>
								</span>
							)}
							{createdOn && (
								<span
									className="inline-flex items-center gap-1.5 whitespace-nowrap"
									data-testid="proposal-date"
								>
									<span aria-hidden>·</span>
									{createdOn}
								</span>
							)}
							{pending && (
								<ProposalExpiry
									transactionBytes={
										proposal.transactionBytes
									}
									variant="inline"
								/>
							)}
							{signed && (
								<span
									className="inline-flex items-center gap-1.5 whitespace-nowrap"
									data-testid="proposal-already-signed"
								>
									<span aria-hidden>·</span>
									{COPY.youSigned}
								</span>
							)}
						</span>
						{executing.error && (
							<span
								className="text-12 break-words text-error-foreground"
								data-testid="proposal-execute-error"
							>
								{COPY.executeFailed(
									executing.error.message,
								)}
							</span>
						)}
					</div>
				</div>
			</td>
			<td className="px-3 py-2.75 @max-md:block @max-md:self-center @max-md:p-0">
				<ProposalStatusChip
					status={shown}
					data-testid="proposal-status"
				/>
			</td>
			<td className="hidden px-3 py-2.75 sm:table-cell @max-md:block @max-md:self-center @max-md:p-0">
				{shownSet && (
					<ProposalWeight signerSet={shownSet} />
				)}
			</td>
			{list && (
				<td className="hidden px-3 py-2.75 md:table-cell @max-md:hidden">
					<div
						className="flex min-w-0"
						data-testid="proposal-proposer"
					>
						<SignerName
							label={proposerLabel}
							address={proposal.proposerAddress}
							marker={proposerMarker}
							markerStyle="parens"
							size="md"
						/>
					</div>
				</td>
			)}
			<td className="px-3 py-2.75 max-sm:pl-0 @max-md:block @max-md:self-center @max-md:p-0">
				<div className="flex items-center justify-end gap-1 @max-md:flex-wrap">
					{shown === 'ready' &&
						(readySet ? (
							<Button
								size="sm"
								className="@max-md:h-9 @max-md:px-3.5"
								onClick={() =>
									executing.execute(proposal, readySet)
								}
								disabled={executing.isPending}
								data-testid="execute-proposal-button"
							>
								{executing.isPending
									? SHARED.executing
									: SHARED.execute}
							</Button>
						) : (
							<span
								className="text-12 whitespace-nowrap text-muted-foreground"
								data-testid="proposal-execute-from-page"
							>
								{COPY.executeFromPage}
							</span>
						))}
					{list && (
						<RowMenu
							explorerUrl={explorerUrl}
							canExport={canExportProposal(status)}
							onDownload={() =>
								downloadJson(
									getProposalExportFilename(
										proposal.digest,
									),
									buildProposalExport(proposal),
								)
							}
							digest={proposal.digest}
						/>
					)}
				</div>
			</td>
		</tr>
	);
}

function RowMenu({
	explorerUrl,
	canExport,
	onDownload,
	digest,
}: {
	/** The transaction on the explorer, once it ran on chain. */
	explorerUrl: string | null;
	canExport: boolean;
	onDownload: () => void;
	digest: string;
}) {
	const { copy } = useCopyToClipboard(
		content.toasts.proposalLinkCopied,
	);
	return (
		<DropdownMenu>
			<MoreActionsTrigger testId="proposal-actions" />
			<DropdownMenuContent
				align="end"
				className="w-auto min-w-40"
			>
				<DropdownMenuGroup>
					<DropdownMenuItem
						onClick={() => copy(proposalLinkUrl(digest))}
						data-testid="copy-proposal-link"
					>
						<Link2 />
						{SHARED.copyLink}
					</DropdownMenuItem>
					{canExport && (
						<DropdownMenuItem
							onClick={onDownload}
							data-testid="export-proposal-button"
						>
							<Download />
							{COPY.download}
						</DropdownMenuItem>
					)}
					{/* Always listed, so the menu keeps its shape; disabled
					    until the transaction ran on chain, and on networks
					    the explorer doesn't index. The disabled item has no
					    anchor, so it can't navigate. */}
					<DropdownMenuItem
						disabled={!explorerUrl}
						render={
							explorerUrl ? (
								<a
									href={explorerUrl}
									target="_blank"
									rel="noopener noreferrer"
								/>
							) : undefined
						}
						data-testid="view-on-explorer"
					>
						<ExternalLink />
						{ACTIONS.viewOnExplorer}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** A row's "⋯" menu trigger, named by its tooltip. */
export function MoreActionsTrigger({
	testId,
	disabled,
}: {
	testId: string;
	disabled?: boolean;
}) {
	return (
		<IconTooltip
			label={content.common.actions.moreActions}
			trigger={
				<DropdownMenuTrigger
					disabled={disabled}
					className={cn(
						buttonVariants({
							variant: 'ghost',
							size: 'icon-sm',
						}),
						'@max-md:size-9',
						disabled && 'disabled:opacity-30',
					)}
					aria-label={content.common.actions.moreActions}
					data-testid={testId}
				/>
			}
		>
			<MoreHorizontal />
		</IconTooltip>
	);
}

/**
 * A tooltip naming an icon-only control. `trigger` is the control's own
 * element, which keeps its ref, so a menu trigger can be one.
 */
function IconTooltip({
	label,
	trigger,
	children,
}: {
	label: string;
	trigger: ReactElement;
	children: ReactNode;
}) {
	return (
		<TooltipProvider delay={150}>
			<Tooltip>
				<TooltipTrigger render={trigger}>
					{children}
				</TooltipTrigger>
				<TooltipContent>{label}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
