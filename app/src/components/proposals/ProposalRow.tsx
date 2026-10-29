// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import {
	ChevronDown,
	ChevronUp,
	Download,
	ExternalLink,
	FileText,
	Link2,
	MoreHorizontal,
	X,
} from 'lucide-react';
import {
	useState,
	type ReactElement,
	type ReactNode,
} from 'react';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useCancelProposal } from '@/hooks/useCancelProposal';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useExecuteOrVerify } from '@/hooks/useExecuteProposal';
import {
	buildProposalExport,
	downloadJson,
	getProposalExportFilename,
} from '@/lib/exportUtils';
import {
	isExternalProposer,
	proposalLinkUrl,
	proposalStatusKey,
	proposalTitle,
	shortDigest,
} from '@/lib/proposalUtils';
import { type ProposalCardInput } from '@/lib/types';
import { cn, getExplorerUrl } from '@/lib/utils';

import { CancelProposalModal } from '../modals/CancelProposalModal';
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
import { ProposalPreview } from './ProposalPreview';
import { ProposalStatusChip } from './ProposalStatusChip';
import { ProposalWeight } from './ProposalWeight';

export type ProposalsTableVariant = 'overview' | 'list';

/**
 * One proposal in the proposals table: what it is, who proposed it,
 * where it stands and Execute. The overview names the proposer in the
 * meta line; the list gives them a column, and adds the digest, a preview
 * that expands under the row (where signing happens) and a menu with the
 * rest of what can be done with it.
 */
export function ProposalRow({
	proposal,
	variant,
	expired,
	proposerLabel,
	columns,
}: {
	proposal: ProposalCardInput;
	variant: ProposalsTableVariant;
	/** Still pending, but past its last epoch. */
	expired: boolean;
	/** The proposer's key label, when they are a labelled signer. */
	proposerLabel: string | null;
	/** How many columns the table has, for the preview row to span. */
	columns: number;
}) {
	const { currentAddress } = useApiAuth();
	const executing = useExecuteOrVerify();
	const [expanded, setExpanded] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const cancel = useCancelProposal();

	const status = expired
		? 'expired'
		: proposalStatusKey(proposal);
	const open = status === 'pending' || status === 'ready';
	const pending =
		proposal.status === ProposalStatus.PENDING;
	const signed =
		pending &&
		!!currentAddress &&
		proposal.signatures.some(
			(sig) => sig.publicKey === currentAddress.publicKey,
		);
	const explorerUrl = getExplorerUrl(
		proposal.digest,
		proposal.network,
	);
	const explorerIsPrimary =
		(status === 'executed' || status === 'failed') &&
		!!explorerUrl;
	const list = variant === 'list';
	// The list shows the digest under the title, unless the title already
	// is the digest (no description). The overview's column is too narrow.
	const showDigest =
		variant === 'list' && !!proposal.description?.trim();
	// A signer goes by their key's label. An outside proposer has none, so
	// goes by address, marked as such.
	const proposerMarker =
		proposal.proposerAddress === currentAddress?.address
			? 'you'
			: isExternalProposer(proposal)
				? 'external'
				: null;
	// The overview's actions cell is empty unless there is something to do;
	// stacked, it would only leave an empty grid column, but hide it anyway.
	const hasActions =
		list || status === 'ready' || explorerIsPrimary;

	return (
		<>
			<tr
				className={cn(
					tableRowClass,
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
							<span
								className="truncate text-14 font-medium @max-md:line-clamp-2 @max-md:whitespace-normal"
								data-testid="proposal-title"
							>
								{proposalTitle(proposal)}
							</span>
							{/* Each item but the proposer brings its own "·"; the
							    first item's is hidden, whichever item that is. The
							    list's proposer is display:none in the table layout,
							    so there the item after it is the first one shown. */}
							<span
								className={cn(
									'flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-12 text-muted-foreground [&>:first-child>[aria-hidden]:first-child]:hidden',
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
									Proposed by{' '}
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
									<span className="inline-flex items-center gap-1 whitespace-nowrap">
										<span aria-hidden className="mr-0.5">
											·
										</span>
										<span className="font-mono">
											{shortDigest(proposal.digest)}
										</span>
										<CopyButton
											value={proposal.digest}
											size="inline"
											successMessage="Digest copied"
										/>
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
										You signed
									</span>
								)}
							</span>
							{executing.error && (
								<span
									className="text-12 break-words text-error-foreground"
									data-testid="proposal-execute-error"
								>
									Couldn't execute:{' '}
									{executing.error.message}
								</span>
							)}
						</div>
					</div>
				</td>
				<td className="px-3 py-2.75 @max-md:block @max-md:self-center @max-md:p-0">
					<ProposalStatusChip
						status={status}
						data-testid="proposal-status"
					/>
				</td>
				<td className="hidden px-3 py-2.75 sm:table-cell @max-md:block @max-md:self-center @max-md:p-0">
					<ProposalWeight proposal={proposal} />
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
				<td
					className={cn(
						'px-3 py-2.75 max-sm:pl-0 @max-md:block @max-md:self-center @max-md:p-0',
						!hasActions && '@max-md:hidden',
					)}
				>
					<div className="flex items-center justify-end gap-1 @max-md:flex-wrap">
						{status === 'ready' && (
							<Button
								size="sm"
								className="@max-md:h-9 @max-md:px-3.5"
								onClick={() => executing.execute(proposal)}
								disabled={executing.isPending}
								data-testid="execute-proposal-button"
							>
								{executing.isPending
									? 'Executing…'
									: 'Execute'}
							</Button>
						)}
						{explorerIsPrimary && (
							<IconTooltip
								label="View on explorer"
								// Only phones show the icon alone.
								contentClassName="sm:hidden @max-md:hidden"
								trigger={
									<a
										href={explorerUrl}
										target="_blank"
										rel="noopener noreferrer"
										className={cn(
											buttonVariants({
												variant: 'outline',
												size: 'sm',
											}),
											'max-sm:size-7 max-sm:px-0 @max-md:h-9 @max-md:w-auto @max-md:px-3.5',
										)}
										aria-label="View on explorer"
										data-testid="view-on-explorer"
									/>
								}
							>
								<ExternalLink />
								<span className="hidden sm:inline @max-md:inline">
									View on explorer
								</span>
							</IconTooltip>
						)}
						{list && open && (
							<IconTooltip
								label={
									expanded ? 'Hide preview' : 'Show preview'
								}
								trigger={
									<Button
										variant="ghost"
										size="icon-sm"
										className="@max-md:size-9"
										onClick={() => setExpanded(!expanded)}
										aria-label={
											expanded
												? 'Hide preview'
												: 'Show preview'
										}
										aria-expanded={expanded}
										data-testid="proposal-toggle-details"
									/>
								}
							>
								{expanded ? <ChevronUp /> : <ChevronDown />}
							</IconTooltip>
						)}
						{list && (
							<RowMenu
								canCancel={pending}
								canShare={open}
								explorerUrl={
									explorerIsPrimary ? null : explorerUrl
								}
								onCancel={() => setCancelling(true)}
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
					{list && (
						<CancelProposalModal
							open={cancelling}
							onClose={() => setCancelling(false)}
							onConfirm={() =>
								cancel.mutate(proposal.id, {
									onSuccess: () => setCancelling(false),
								})
							}
							isLoading={cancel.isPending}
							proposalId={proposal.id}
						/>
					)}
				</td>
			</tr>
			{expanded && open && (
				<tr className={cn(tableRowClass, '@max-md:block')}>
					<td
						colSpan={columns}
						className="bg-muted/30 p-4 @max-md:block"
					>
						<ProposalPreview
							proposal={proposal}
							userHasSigned={signed}
							onCancel={() => setCancelling(true)}
							isCancelling={cancel.isPending}
						/>
					</td>
				</tr>
			)}
		</>
	);
}

function RowMenu({
	canCancel,
	canShare,
	explorerUrl,
	onCancel,
	onDownload,
	digest,
}: {
	canCancel: boolean;
	canShare: boolean;
	/** The explorer link, unless the row already shows it. */
	explorerUrl: string | null;
	onCancel: () => void;
	onDownload: () => void;
	digest: string;
}) {
	const { copy } = useCopyToClipboard('Link copied');
	return (
		<DropdownMenu>
			<IconTooltip
				label="More actions"
				trigger={
					<DropdownMenuTrigger
						className={cn(
							buttonVariants({
								variant: 'ghost',
								size: 'icon-sm',
							}),
							'@max-md:size-9',
						)}
						aria-label="More actions"
						data-testid="proposal-actions"
					/>
				}
			>
				<MoreHorizontal />
			</IconTooltip>
			<DropdownMenuContent
				align="end"
				className="w-auto min-w-40"
			>
				<DropdownMenuGroup>
					{canShare && (
						<DropdownMenuItem
							onClick={() => copy(proposalLinkUrl(digest))}
							data-testid="copy-proposal-link"
						>
							<Link2 />
							Copy link
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						onClick={onDownload}
						data-testid="export-proposal-button"
					>
						<Download />
						Download
					</DropdownMenuItem>
					{explorerUrl && (
						<DropdownMenuItem
							render={
								<a
									href={explorerUrl}
									target="_blank"
									rel="noopener noreferrer"
								/>
							}
							data-testid="view-on-explorer"
						>
							<ExternalLink />
							View on explorer
						</DropdownMenuItem>
					)}
					{canCancel && (
						<DropdownMenuItem
							variant="destructive"
							onClick={onCancel}
							data-testid="cancel-proposal-button"
						>
							<X />
							Cancel proposal
						</DropdownMenuItem>
					)}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * A tooltip naming an icon-only control. `trigger` is the control's own
 * element, which keeps its ref, so a menu trigger can be one.
 */
function IconTooltip({
	label,
	trigger,
	contentClassName,
	children,
}: {
	label: string;
	trigger: ReactElement;
	contentClassName?: string;
	children: ReactNode;
}) {
	return (
		<TooltipProvider delay={150}>
			<Tooltip>
				<TooltipTrigger render={trigger}>
					{children}
				</TooltipTrigger>
				<TooltipContent className={contentClassName}>
					{label}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
