// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';
import { Download, Info, Link2, Mail } from 'lucide-react';
import {
	useEffect,
	useMemo,
	type ReactElement,
} from 'react';

import { ChangeList } from '@/components/change-signers/ReviewStep';
import { ShortAddress } from '@/components/invitations/ShortAddress';
import { SignerName } from '@/components/multisig/SignerName';
import { analyzerTab } from '@/components/preview-effects/IntentSummary';
import { ProposalExpiry } from '@/components/proposals/ProposalExpiry';
import { ProposalStatusChip } from '@/components/proposals/ProposalStatusChip';
import { AliasCallsWarning } from '@/components/transaction-preview/AliasCallsWarning';
import { PreviewHeading } from '@/components/transaction-preview/parts';
import {
	expiredSimulation,
	simulationProps,
} from '@/components/transaction-preview/simulation';
import { TransactionPreview } from '@/components/transaction-preview/TransactionPreview';
import { Button } from '@/components/ui/button';
import { cardClass } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { Notice } from '@/components/wizard/parts';
import { content } from '@/content';
import {
	useNetwork,
	type SuiNetwork,
} from '@/contexts/NetworkContext';
import { usePodAliasSet } from '@/hooks/useAliasSets';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { refusedAsExpired } from '@/hooks/useDryRun';
import { useEpochInfo } from '@/hooks/useEpochInfo';
import { useExpiry } from '@/hooks/useExpiry';
import { useTransactionPreview } from '@/hooks/useTransactionPreview';
import {
	changeTitle,
	type Difference,
} from '@/lib/change-signers';
import { joinList } from '@/lib/create-multisig';
import { formatDateTime } from '@/lib/dates';
import {
	buildProposalExport,
	downloadJson,
	getProposalExportFilename,
} from '@/lib/exportUtils';
import { networkLabel } from '@/lib/network';
import {
	isMember,
	type AppProposal,
	type ShownPod,
} from '@/lib/proposal-integrity';
import {
	checkedChange,
	proposalPageStatus,
	withReason,
	type Labels,
	type SimulationVerdict,
} from '@/lib/proposal-page';
import {
	canExportProposal,
	isExternalProposer,
	proposalLinkUrl,
	proposalTitle,
	toProposalCardInput,
	type CountedProposal,
	type ProposalStatusKey,
} from '@/lib/proposalUtils';
import { QueryKeys } from '@/lib/queryKeys';
import { safeDecode } from '@/lib/utils';

import { ActivityCard } from './ActivityCard';
import { ApprovalsCard } from './ApprovalsCard';
import { OnChainCard } from './OnChainCard';

const COPY = content.proposal.detail;
const SHARED = content.proposal.shared;

/**
 * A proposal's page: the header, the transaction preview on the left
 * (the dry run; once executed, the transaction's outcome and digest,
 * pointing to the explorer) and the approvals and activity on the
 * right, stacked below `lg`.
 * `proposalsPath` links back to the account's proposals, when the page
 * is under the account. The signers shown are the proposal's signer sets
 * that pass the app's checks on its network.
 */
export function ProposalView({
	proposal: received,
	pod,
	openedDigest,
	labels,
	proposalsPath,
	canCancel,
}: {
	proposal: AppProposal;
	/** The pod from the viewer's own account read; null on the shared page. */
	pod: ShownPod | null;
	/** The digest the viewer opened, from the page's URL. */
	openedDigest: string;
	labels: Labels;
	proposalsPath: string | null;
	/**
	 * Whether the viewer may cancel: only under the account, where the
	 * API knows them as an accepted member.
	 */
	canCancel: boolean;
}) {
	const { network, setNetwork } = useNetwork();
	const { data: epochInfo } = useEpochInfo();
	const wallet = useCurrentAccount();
	const client = useDAppKit().getClient();
	const { dryRun, analysis, preview } =
		useTransactionPreview();
	const aliases = usePodAliasSet(received.accountAddress, {
		network: received.network as SuiNetwork,
	});
	const proposal = useMemo(
		() =>
			toProposalCardInput(
				received,
				aliases,
				wallet?.address,
			),
		[received, aliases, wallet?.address],
	);

	const mismatch = proposal.network !== network;
	// The epoch is the current network's: on another network there is no
	// expiry verdict.
	const status = proposalPageStatus(
		proposal,
		mismatch ? undefined : epochInfo,
	);
	const onChain =
		status === 'executed' || status === 'failed';
	const open = status === 'pending' || status === 'ready';
	// Only what the bytes do, checked against the node's alias set.
	const checked = useMemo(
		() =>
			checkedChange(proposal, aliases, labels, {
				pod: pod?.address ?? proposal.accountAddress,
				digest: openedDigest,
			}),
		[aliases, proposal, labels, pod, openedDigest],
	);
	const changes = open ? (checked?.list ?? null) : null;

	// The connected wallet is in one of the proposal's signer sets, which
	// Sign then checks. Signing needs only the wallet; the network has to
	// be the proposal's.
	const member = wallet
		? proposal.signerSets
				.flatMap((set) => set.members)
				.find((m) =>
					isMember({ members: [m] }, wallet.address),
				)
		: undefined;
	const viewer = !member
		? 'outsider'
		: mismatch
			? 'elsewhere'
			: 'member';

	const expiry = useExpiry(proposal.transactionBytes);
	const knownExpired = !mismatch && !!expiry?.expired;

	// Proposals not on chain show a dry run unless their transaction has
	// expired; executed and failed ones read it from the chain instead.
	// Nothing runs on another network.
	useEffect(() => {
		if (mismatch || onChain) return;
		preview(proposal.transactionBytes, {
			simulate: !knownExpired,
		});
	}, [
		mismatch,
		onChain,
		knownExpired,
		proposal.transactionBytes,
		preview,
	]);

	const chain = useQuery({
		queryKey: [
			QueryKeys.OnChainTransaction,
			proposal.network,
			proposal.digest,
		],
		queryFn: async () => {
			const result = await client.getTransaction({
				digest: proposal.digest,
				include: { effects: true },
			});
			return result.Transaction ?? result.FailedTransaction;
		},
		enabled: onChain && !mismatch,
		staleTime: Infinity,
	});
	const chainResult = chain.data ?? null;

	const simulation = onChain
		? null
		: knownExpired || refusedAsExpired(dryRun.error)
			? expiredSimulation
			: simulationProps(dryRun);
	const verdict: SimulationVerdict =
		!simulation || simulation.status === 'expired'
			? 'unknown'
			: simulation.status;
	const simulationError =
		simulation?.status === 'failed'
			? safeDecode(
					simulation.error ||
						simulation.result?.status.error?.message ||
						'',
				)
			: null;
	const executionError =
		chainResult?.status.error?.message ?? null;

	const accounts = useMemo(
		() => [
			{
				address: proposal.accountAddress,
				name: proposal.accountName,
			},
		],
		[proposal.accountAddress, proposal.accountName],
	);
	const { analyzer, analyzerCount } = analyzerTab(analysis);

	let previewBlock: ReactElement;
	if (mismatch) {
		previewBlock = (
			<>
				<PreviewHeading />
				<p
					className="text-13 text-muted-foreground"
					data-testid="transaction-preview-unreachable"
				>
					{COPY.switchToSeePreview(
						networkLabel(proposal.network as SuiNetwork),
					)}
				</p>
			</>
		);
	} else if (simulation) {
		previewBlock = (
			<TransactionPreview
				bytes={proposal.transactionBytes}
				accounts={accounts}
				analyzer={analyzer}
				analyzerCount={analyzerCount}
				signingNotice={open}
				{...simulation}
			/>
		);
	} else {
		previewBlock = (
			<>
				{analyzer}
				<PreviewHeading />
				<Notice
					tone="error"
					testId="transaction-preview-unreachable"
				>
					{safeDecode(
						dryRun.error?.message || COPY.notSimulated,
					)}
				</Notice>
			</>
		);
	}

	const proposerLabel =
		labels.get(proposal.proposerAddress) ?? null;
	const proposerMarker =
		proposal.proposerAddress === wallet?.address
			? 'you'
			: isExternalProposer(proposal)
				? 'external'
				: null;
	const createdAt = formatDateTime(proposal.createdAt);

	return (
		<div
			className="page-shell"
			data-testid="proposal-page"
			data-digest={proposal.digest}
			data-status={status}
		>
			<PageHeader
				title={
					checked?.list
						? changeTitle(checked.list)
						: proposalTitle(proposal)
				}
				backLink={proposalsPath ?? undefined}
				backLabel={SHARED.backLabel}
				className="mb-6"
				description={
					<span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-13 max-sm:flex-col max-sm:items-start max-sm:[&>span>[aria-hidden]]:hidden">
						<ProposalStatusChip
							status={status}
							className="mr-0.5"
							data-testid="proposal-status"
						/>
						{/* Inline text, so the name and address wrap as words. */}
						<span
							className="min-w-0"
							data-testid="proposal-proposer"
						>
							<span className="whitespace-nowrap">
								{SHARED.proposedBy}
							</span>{' '}
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
							{proposerLabel && (
								<>
									{' '}
									<ShortAddress
										address={proposal.proposerAddress}
										className="font-mono text-12 whitespace-nowrap"
									/>
								</>
							)}
						</span>
						{createdAt && (
							<span className="inline-flex items-center gap-1.5 whitespace-nowrap">
								<span aria-hidden>·</span>
								{createdAt}
							</span>
						)}
						{proposal.status === 'PENDING' && !mismatch && (
							<ProposalExpiry
								transactionBytes={proposal.transactionBytes}
								variant="inline"
							/>
						)}
					</span>
				}
				actions={
					<HeaderActions
						proposal={proposal}
						status={status}
					/>
				}
			/>

			{(mismatch ||
				(open && simulationError !== null) ||
				status === 'failed') && (
				<div className="mb-4 flex flex-col gap-3">
					{mismatch && (
						<Notice
							tone="warning"
							testId="proposal-network-mismatch"
						>
							{COPY.networkMismatch(
								networkLabel(
									proposal.network as SuiNetwork,
								),
								networkLabel(network),
							)}{' '}
							<Button
								variant="outline"
								size="sm"
								className="ml-1 align-middle"
								onClick={() =>
									setNetwork(proposal.network as SuiNetwork)
								}
								data-testid="switch-network-button"
							>
								{COPY.switchTo(
									networkLabel(
										proposal.network as SuiNetwork,
									),
								)}
							</Button>
						</Notice>
					)}
					{open && simulationError !== null && (
						<Notice
							tone="error"
							testId="proposal-simulation-failed"
						>
							{COPY.simulationFailed(
								withReason(simulationError),
							)}
						</Notice>
					)}
					{status === 'failed' && (
						<Notice
							tone="error"
							testId="proposal-execution-failed"
						>
							{COPY.executionFailed(
								withReason(
									safeDecode(executionError ?? ''),
								),
							)}
						</Notice>
					)}
				</div>
			)}
			{open && !changes && (
				<AliasCallsWarning
					bytes={proposal.transactionBytes}
					network={proposal.network as SuiNetwork}
					className="mb-4"
				/>
			)}

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="flex min-w-0 flex-col gap-4">
					{changes && <ChangesCard list={changes} />}
					{onChain ? (
						<OnChainCard
							proposal={proposal}
							status={status}
							result={chainResult}
							error={chain.error?.message ?? null}
						/>
					) : (
						<section
							className={cardClass}
							aria-label={content.common.transactionPreview}
						>
							{previewBlock}
						</section>
					)}
				</div>
				<div className="flex min-w-0 flex-col gap-4">
					<ApprovalsCard
						proposal={proposal}
						pod={pod}
						aliases={aliases}
						change={checked?.change ?? null}
						openedDigest={openedDigest}
						status={status}
						labels={labels}
						viewer={viewer}
						viewerPublicKey={member?.publicKey ?? null}
						simulation={simulation}
						verdict={verdict}
						canCancel={canCancel}
					/>
					<ActivityCard
						proposal={proposal}
						status={status}
						labels={labels}
						currentAddress={wallet?.address ?? null}
						confirmedAt={chainResult?.timestampMs ?? null}
					/>
				</div>
			</div>
		</div>
	);
}

function ChangesCard({ list }: { list: Difference[] }) {
	const COPY = content.changeSigners.review;
	const added = list.flatMap((item) =>
		item.kind === 'add' && item.name ? [item.name] : [],
	);
	return (
		<section
			className={cardClass}
			data-testid="signer-change-changes"
		>
			<h3 className="text-15 font-medium">
				{COPY.changes}
			</h3>
			<ChangeList list={list} />
			{added.length > 0 && (
				<p className="flex items-start gap-1.5 text-12">
					<Mail className="mt-0.5 size-3 shrink-0" />
					{COPY.invitation(
						joinList(added, 'and'),
						added.length,
					)}
				</p>
			)}
			<p className="flex items-start gap-1.5 text-12 text-muted-foreground">
				<Info className="mt-0.5 size-3 shrink-0" />
				{COPY.onceExecutes}
			</p>
		</section>
	);
}

/**
 * Export, where `canExportProposal` allows it, and Copy link on every
 * status, as icon buttons.
 */
function HeaderActions({
	proposal,
	status,
}: {
	proposal: CountedProposal;
	status: ProposalStatusKey;
}) {
	const { copy } = useCopyToClipboard(
		content.toasts.proposalLinkCopied,
	);
	return (
		<TooltipProvider delay={150}>
			{canExportProposal(status) && (
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="outline"
								size="icon"
								aria-label={COPY.export}
								onClick={() =>
									downloadJson(
										getProposalExportFilename(
											proposal.digest,
										),
										buildProposalExport(proposal),
									)
								}
								data-testid="export-proposal-button"
							/>
						}
					>
						<Download />
					</TooltipTrigger>
					<TooltipContent>{COPY.export}</TooltipContent>
				</Tooltip>
			)}
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="outline"
							size="icon"
							aria-label={SHARED.copyLink}
							onClick={() =>
								copy(proposalLinkUrl(proposal.digest))
							}
							data-testid="copy-proposal-link"
						/>
					}
				>
					<Link2 />
				</TooltipTrigger>
				<TooltipContent>{SHARED.copyLink}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
