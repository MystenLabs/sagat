// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { ProposalStatus } from '@mysten/sagat';
import { useQuery } from '@tanstack/react-query';
import { Download, Link2 } from 'lucide-react';
import {
	useEffect,
	useMemo,
	type ReactElement,
} from 'react';

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { SignerName } from '@/components/multisig/SignerName';
import { analyzerTab } from '@/components/preview-effects/IntentSummary';
import { ProposalExpiry } from '@/components/proposals/ProposalExpiry';
import { ProposalStatusChip } from '@/components/proposals/ProposalStatusChip';
import { PreviewHeading } from '@/components/transaction-preview/parts';
import { simulationProps } from '@/components/transaction-preview/simulation';
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
import {
	useNetwork,
	type SuiNetwork,
} from '@/contexts/NetworkContext';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useEpochInfo } from '@/hooks/useEpochInfo';
import { useTransactionPreview } from '@/hooks/useTransactionPreview';
import { formatDateTime } from '@/lib/dates';
import {
	buildProposalExport,
	downloadJson,
	getProposalExportFilename,
} from '@/lib/exportUtils';
import { networkLabel } from '@/lib/network';
import {
	hasSigned,
	proposalPageStatus,
	trimPeriod,
	type Labels,
	type SimulationVerdict,
} from '@/lib/proposal-page';
import {
	isExternalProposer,
	proposalLinkUrl,
	proposalTitle,
} from '@/lib/proposalUtils';
import { QueryKeys } from '@/lib/queryKeys';
import { validatePublicKey } from '@/lib/sui-utils';
import type { SimulatedTransaction } from '@/lib/transaction-preview';
import { type ProposalCardInput } from '@/lib/types';
import { safeDecode } from '@/lib/utils';

import { ActivityCard } from './ActivityCard';
import { ApprovalsCard } from './ApprovalsCard';

/**
 * A proposal's page: the header, the transaction preview on the left
 * (the dry run while it is open, the chain's result once executed) and
 * the approvals and activity on the right, stacked below `lg`.
 * `proposalsPath` links back to the account's proposals, when the page
 * is under the account.
 */
export function ProposalView({
	proposal,
	labels,
	proposalsPath,
	canCancel,
}: {
	proposal: ProposalCardInput;
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

	const mismatch = proposal.network !== network;
	// The epoch is the current network's: on another network there is no
	// expiry verdict.
	const status = proposalPageStatus(
		proposal,
		mismatch ? undefined : epochInfo,
	);
	const onChain =
		proposal.status === ProposalStatus.SUCCESS ||
		proposal.status === ProposalStatus.FAILURE;
	const open = status === 'pending' || status === 'ready';

	// The connected wallet is one of the signers. Signing needs only the
	// wallet; the network has to be the proposal's.
	const member = wallet
		? proposal.multisig.members.find(
				(m) =>
					validatePublicKey(m.publicKey).address ===
					wallet.address,
			)
		: undefined;
	const viewer = !member
		? 'outsider'
		: mismatch
			? 'elsewhere'
			: 'member';

	// Open, cancelled and expired proposals show a dry run; executed and
	// failed ones the chain's result. Nothing runs on another network.
	const { mutate: analyze } = analysis;
	useEffect(() => {
		if (mismatch) return;
		if (onChain) analyze(proposal.transactionBytes);
		else preview(proposal.transactionBytes);
	}, [
		mismatch,
		onChain,
		proposal.transactionBytes,
		preview,
		analyze,
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
				include: {
					effects: true,
					balanceChanges: true,
					events: true,
					transaction: true,
					objectTypes: true,
				},
			});
			return (result.Transaction ??
				result.FailedTransaction) as SimulatedTransaction;
		},
		enabled: onChain && !mismatch,
		staleTime: Infinity,
	});
	const chainResult = chain.data ?? null;

	const simulation = onChain
		? null
		: simulationProps(dryRun);
	const verdict: SimulationVerdict = simulation
		? simulation.status
		: 'unknown';
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
				address: proposal.multisig.address,
				name: proposal.multisig.name ?? null,
			},
		],
		[proposal.multisig.address, proposal.multisig.name],
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
					Switch to{' '}
					{networkLabel(proposal.network as SuiNetwork)} to
					see the transaction preview.
				</p>
			</>
		);
	} else if (onChain) {
		previewBlock = chain.isError ? (
			<>
				<PreviewHeading />
				<p
					className="rounded-lg border border-error-border bg-card p-3 text-13 text-error-foreground"
					data-testid="transaction-preview-unreachable"
				>
					Couldn't load the transaction from the chain:{' '}
					{chain.error.message}
				</p>
			</>
		) : (
			<TransactionPreview
				bytes={proposal.transactionBytes}
				accounts={accounts}
				analyzer={analyzer}
				analyzerCount={analyzerCount}
				source="chain"
				status={
					!chainResult
						? 'pending'
						: chainResult.effects.status.success
							? 'passed'
							: 'failed'
				}
				result={chainResult}
				simulatedAt={chainResult?.timestampMs ?? null}
			/>
		);
	} else if (simulation) {
		previewBlock = (
			<TransactionPreview
				bytes={proposal.transactionBytes}
				accounts={accounts}
				analyzer={analyzer}
				analyzerCount={analyzerCount}
				signingNotice={
					status === 'pending' &&
					viewer === 'member' &&
					!hasSigned(proposal, member?.publicKey)
				}
				{...simulation}
			/>
		);
	} else {
		previewBlock = (
			<>
				{analyzer}
				<PreviewHeading />
				<p
					className="rounded-lg border border-error-border bg-card p-3 text-13 text-error-foreground"
					data-testid="transaction-preview-unreachable"
				>
					{safeDecode(
						dryRun.error?.message ||
							'The transaction could not be simulated.',
					)}
				</p>
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
				title={proposalTitle(proposal)}
				backLink={proposalsPath ?? undefined}
				backLabel="Proposals"
				className="mb-6"
				description={
					<span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 max-sm:flex-col max-sm:items-start max-sm:[&>span>[aria-hidden]]:hidden">
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
								Proposed by
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
						{proposal.status === ProposalStatus.PENDING &&
							!mismatch && (
								<ProposalExpiry
									transactionBytes={
										proposal.transactionBytes
									}
									variant="inline"
								/>
							)}
					</span>
				}
				actions={<HeaderActions proposal={proposal} />}
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
							This proposal is on{' '}
							{networkLabel(proposal.network as SuiNetwork)}
							, but you’re on {networkLabel(network)}.{' '}
							<Button
								variant="outline"
								size="sm"
								className="ml-1 align-middle"
								onClick={() =>
									setNetwork(proposal.network as SuiNetwork)
								}
								data-testid="switch-network-button"
							>
								Switch to{' '}
								{networkLabel(
									proposal.network as SuiNetwork,
								)}
							</Button>
						</Notice>
					)}
					{open && simulationError !== null && (
						<Notice
							tone="error"
							testId="proposal-simulation-failed"
						>
							Simulation failed
							{simulationError
								? `: ${trimPeriod(simulationError)}`
								: ''}
							. If executed, it would fail and the account
							would still pay gas.
						</Notice>
					)}
					{status === 'failed' && (
						<Notice
							tone="error"
							testId="proposal-execution-failed"
						>
							Execution failed
							{executionError
								? `: ${trimPeriod(safeDecode(executionError))}`
								: ''}
							. No funds moved, but the account paid gas.
						</Notice>
					)}
				</div>
			)}

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<section
					className={cardClass}
					aria-label="Transaction preview"
				>
					{previewBlock}
				</section>
				<div className="flex min-w-0 flex-col gap-4">
					<ApprovalsCard
						proposal={proposal}
						status={status}
						labels={labels}
						viewer={viewer}
						viewerPublicKey={member?.publicKey ?? null}
						dryRun={dryRun}
						simulation={simulation}
						verdict={verdict}
						chainResult={chainResult}
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

/** Export and Copy link, as icon buttons. */
function HeaderActions({
	proposal,
}: {
	proposal: ProposalCardInput;
}) {
	const { copy } = useCopyToClipboard('Link copied');
	return (
		<TooltipProvider delay={150}>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="outline"
							size="icon"
							aria-label="Export"
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
				<TooltipContent>Export</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="outline"
							size="icon"
							aria-label="Copy link"
							onClick={() =>
								copy(proposalLinkUrl(proposal.digest))
							}
							data-testid="copy-proposal-link"
						/>
					}
				>
					<Link2 />
				</TooltipTrigger>
				<TooltipContent>Copy link</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
