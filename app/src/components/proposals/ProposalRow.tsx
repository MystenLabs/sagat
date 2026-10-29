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

	return (
		<>
			<tr
				className={tableRowClass}
				data-testid="proposal-row"
				data-digest={proposal.digest}
				data-status={status}
			>
				<td className="px-3 py-2.75">
					<div className="flex min-w-0 items-center gap-3">
						{variant === 'overview' && (
							// The kind of proposal isn't decoded yet, so one icon for all.
							<span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground-secondary sm:flex">
								<FileText className="size-4" />
							</span>
						)}
						<div className="flex min-w-0 flex-col gap-0.75">
							<span
								className="truncate text-14 font-medium"
								data-testid="proposal-title"
							>
								{proposalTitle(proposal)}
							</span>
							{/* Each item but the proposer brings its own "·"; the
							    first item's is hidden, whichever item that is. */}
							<span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-12 text-muted-foreground [&>:first-child>[aria-hidden]:first-child]:hidden">
								{variant === 'overview' && (
									<span
										className="inline-flex min-w-0 items-center gap-1"
										data-testid="proposal-proposer"
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
								)}
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
				<td className="px-3 py-2.75">
					<ProposalStatusChip
						status={status}
						data-testid="proposal-status"
					/>
				</td>
				<td className="hidden px-3 py-2.75 sm:table-cell">
					<ProposalWeight proposal={proposal} />
				</td>
				{list && (
					<td className="hidden px-3 py-2.75 md:table-cell">
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
				<td className="px-3 py-2.75 max-sm:pl-0">
					<div className="flex items-center justify-end gap-1">
						{status === 'ready' && (
							<Button
								size="sm"
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
								contentClassName="sm:hidden"
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
											'max-sm:size-7 max-sm:px-0',
										)}
										aria-label="View on explorer"
										data-testid="view-on-explorer"
									/>
								}
							>
								<ExternalLink />
								<span className="hidden sm:inline">
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
				<tr className={tableRowClass}>
					<td colSpan={columns} className="bg-muted/30 p-4">
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
						className={buttonVariants({
							variant: 'ghost',
							size: 'icon-sm',
						})}
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
