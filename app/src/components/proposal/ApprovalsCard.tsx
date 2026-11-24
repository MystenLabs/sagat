// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { type Proposal } from '@mysten/sagat/v1';
import { useQuery } from '@tanstack/react-query';
import { Pen, Play, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { CancelProposalModal } from '@/components/modals/CancelProposalModal';
import { FoldedRow } from '@/components/multisig/FoldedRow';
import { SignerName } from '@/components/multisig/SignerName';
import { SignersUnchecked } from '@/components/multisig/SignersUnchecked';
import type { SimulationProps } from '@/components/transaction-preview/simulation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/button';
import {
	cardClass,
	CardHeading,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { LearnMoreLink } from '@/components/ui/learn-more-link';
import {
	Modal,
	ModalActions,
	ModalContent,
	ModalHeader,
} from '@/components/ui/modal';
import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { chainIdentifierQuery } from '@/hooks/useAliasSets';
import { useCancelProposal } from '@/hooks/useCancelProposal';
import {
	couldNotSimulate,
	useDryRun,
} from '@/hooks/useDryRun';
import { useExecuteOrVerify } from '@/hooks/useExecuteProposal';
import { useProposalProposerCheck } from '@/hooks/useProposerProofs';
import { useSignProposal } from '@/hooks/useSignProposal';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import { type AliasRead } from '@/lib/alias-set';
import {
	networkLabel,
	type SuiNetwork,
} from '@/lib/network';
import {
	checkProposalIntegrity,
	checkSignerOnNetwork,
	type ShownPod,
} from '@/lib/proposal-integrity';
import {
	approvalRows,
	approvalsNote,
	approvalsSignerSets,
	approvalsStatus,
	cancelVariant,
	foldedSignerSetsLine,
	gasEstimate,
	hasSigned,
	withReason,
	wouldReachThreshold,
	type ApprovalRow,
	type ApprovalsNoteInput,
	type ApprovalsSignerSet,
	type Labels,
	type SimulationVerdict,
} from '@/lib/proposal-page';
import {
	proposalTitle,
	readySignerSet,
	shownSignerSet,
	type CountedProposal,
	type CountedSignerSet,
	type ProposalStatusKey,
} from '@/lib/proposalUtils';
import { signRefusedLine } from '@/lib/signers-refused';
import { approvalsThresholdLabel } from '@/lib/threshold';
import {
	namedChain,
	readTransactionBytes,
} from '@/lib/transaction-preview';
import { cn, safeDecode } from '@/lib/utils';

const COPY = content.proposal.approvals;
const SHARED = content.proposal.shared;
const ACTIONS = content.common.actions;
const STATES = content.common.states;
const PROPOSER_DOCS =
	'/security/proposer-confirmations#confirmed-proposals';

/**
 * Who signed, what the threshold needs, and what the viewer can do
 * about it: sign (and execute, when their signature reaches the
 * threshold), execute, or cancel. Only a signer on the proposal's
 * network gets the buttons. Bytes that fail `checkProposalIntegrity`, a
 * wallet no acting set holds on the proposal's network, bytes naming
 * another chain, or an invalid proposer, get a refusal in place of Sign;
 * an alias set that couldn't be read gets a notice there instead.
 */
export function ApprovalsCard({
	proposal,
	pod,
	aliases,
	openedDigest,
	status,
	labels,
	viewer,
	viewerPublicKey,
	simulation,
	verdict,
	canCancel: cancelAllowed,
}: {
	proposal: CountedProposal;
	/** The pod from the viewer's own account read; null on the shared page. */
	pod: ShownPod | null;
	/** The pod's alias set on the proposal's network, undefined until read. */
	aliases: AliasRead | undefined;
	/** The digest the viewer opened, from the page's URL. */
	openedDigest: string;
	status: ProposalStatusKey;
	labels: Labels;
	viewer: ApprovalsNoteInput['viewer'];
	/** The viewer's key, when they are a signer. */
	viewerPublicKey: string | null;
	simulation: SimulationProps | null;
	verdict: SimulationVerdict;
	/**
	 * Whether the viewer may cancel: only under the account, where the
	 * API knows them as an accepted member.
	 */
	canCancel: boolean;
}) {
	const { currentAddress } = useApiAuth();
	const { data: pods } = useUserMultisigs();
	const wallet = useCurrentAccount();
	const sign = useSignProposal();
	const executing = useExecuteOrVerify();
	const cancel = useCancelProposal();
	// Execute's second simulation of a failing proposal, apart from the
	// page's, so a run that can't happen doesn't wipe the failure the page
	// shows.
	const recheck = useDryRun();
	const [executeAfterSigning, setExecuteAfterSigning] =
		useState(true);
	const [cancelling, setCancelling] = useState(false);
	// Set when an execution starts and cleared only when it fails, so
	// the button stays on Executing… until the proposal refetches as
	// closed instead of flashing back to Execute in between.
	const [settling, setSettling] = useState(false);
	// Why the second simulation didn't clear it: the execute-anyway
	// dialog's title and first sentence. Kept after the dialog closes, so
	// it doesn't empty while it animates out.
	const [stillFails, setStillFails] = useState<{
		title: string;
		message: string;
	} | null>(null);
	const [askingToExecute, setAskingToExecute] =
		useState(false);

	const signed = hasSigned(proposal, viewerPublicKey);
	const reaches = wouldReachThreshold(
		proposal,
		viewerPublicKey,
	);
	const gas = gasEstimate(simulation?.result);
	const isExecuting =
		executing.isPending ||
		(settling &&
			(status === 'pending' || status === 'ready'));
	const execute = (
		target: Proposal,
		signerSet: CountedSignerSet,
	) => {
		setSettling(true);
		executing.execute(target, signerSet, {
			onError: () => setSettling(false),
		});
	};
	const rechecking = recheck.isPending;
	const canAct = viewer === 'member';
	const shownSet = shownSignerSet(
		proposal.checkedSignerSets,
	);
	const readySet = readySignerSet(
		proposal.checkedSignerSets,
	);
	const walletAddress = wallet?.address ?? null;
	const awaitingSign = status === 'pending' && !signed;
	// The node's chain identifier is read only where Sign can show.
	const checkNetwork = canAct && awaitingSign;
	const network = proposal.network as SuiNetwork;
	const dappKit = useDAppKit();
	const bytesChain = useMemo(() => {
		try {
			return namedChain(
				readTransactionBytes(proposal.transactionBytes)
					.transaction,
			);
		} catch {
			return null;
		}
	}, [proposal.transactionBytes]);
	const { data: nodeChain } = useQuery({
		...chainIdentifierQuery(
			dappKit.getClient(network),
			network,
		),
		enabled: checkNetwork && !!bytesChain,
	});
	const proposer = useProposalProposerCheck(proposal, {
		enabled: checkNetwork,
		aliases,
	});
	const integrity = useMemo(
		() =>
			canAct && walletAddress
				? checkProposalIntegrity(proposal, {
						pod,
						openedDigest,
						signerAddress: walletAddress,
					})
				: null,
		[canAct, walletAddress, pod, proposal, openedDigest],
	);
	// Rule 2 and the bytes' chain, once the synchronous checks pass.
	const onNetwork =
		!checkNetwork || !walletAddress || integrity
			? null
			: aliases === undefined ||
				  (bytesChain && nodeChain === undefined)
				? 'checking'
				: checkSignerOnNetwork({
						shown: proposal.signerSets,
						signerAddress: walletAddress,
						namedChain: bytesChain,
						node: { aliases, chain: nodeChain ?? null },
					});
	const refused =
		integrity ??
		(onNetwork === 'chain' || onNetwork === 'notActing'
			? onNetwork
			: null) ??
		(canAct && walletAddress && proposer.check === 'invalid'
			? 'proposer'
			: null);
	const refusing = refused !== null && awaitingSign;
	const unchecked =
		!refusing && onNetwork === 'unchecked' && awaitingSign;
	const checkingSigners = onNetwork === 'checking';
	// Cancelling signs a message for the API session.
	const canCancel =
		cancelAllowed && canAct && !!currentAddress;
	const settled =
		verdict === 'passed' ||
		verdict === 'failed' ||
		verdict === 'unknown';
	const failing = verdict === 'failed';
	// Only after a dry run that passed: signing blind (`unknown`) never
	// executes in the same step.
	const offerExecuteAfterSigning =
		status === 'pending' &&
		!signed &&
		verdict === 'passed' &&
		reaches;
	const signAndExecute =
		offerExecuteAfterSigning && executeAfterSigning;
	const signLabel = () => {
		if (sign.awaitingWallet) return STATES.confirmInWallet;
		if (sign.isPending) return STATES.signing;
		if (checkingSigners) return STATES.checkingSigners;
		if (failing) return COPY.signAnyway;
		if (signAndExecute) return ACTIONS.signAndExecute;
		return COPY.signProposal;
	};

	const rows = approvalRows(
		proposal,
		status,
		labels,
		viewerPublicKey,
	);
	// Per set only when there are several, the main set first; one set keeps the single list.
	const signerSets =
		proposal.checkedSignerSets.length > 1
			? approvalsSignerSets(
					proposal,
					status,
					labels,
					viewerPublicKey,
					pods ?? [],
				)
			: null;
	const [mainSet, ...foldedSets] = signerSets ?? [];
	const statusLine =
		mainSet && status === 'pending' && !isExecuting
			? mainSet.line
			: approvalsStatus(
					proposal,
					status,
					isExecuting,
					verdict,
				);
	const note = approvalsNote({
		proposal,
		status,
		labels,
		publicKey: viewerPublicKey,
		viewer,
		simulation: verdict,
		executeAfterSigning: signAndExecute,
		executing: isExecuting,
		gas,
	});

	const onSign = () => {
		sign.mutate(
			{ proposal, pod, openedDigest },
			{
				onSuccess: ({ voted, counted }) => {
					const ready = readySignerSet(
						counted.checkedSignerSets,
					);
					if (
						!ready ||
						!offerExecuteAfterSigning ||
						!executeAfterSigning
					)
						return;
					// The proposal the vote returned, so it needn't wait for the refetch.
					execute(voted, ready);
				},
			},
		);
	};

	// A failing simulation is run again first: when it passes now, the
	// proposal executes; when it still fails, or can't run this time, the
	// viewer is asked.
	const onExecute = () => {
		if (!readySet) return;
		if (!failing) {
			execute(proposal, readySet);
			return;
		}
		recheck.mutate(proposal.transactionBytes, {
			onSuccess: () => execute(proposal, readySet),
			onError: (error) => {
				const reason = withReason(
					safeDecode(error.message),
				);
				setAskingToExecute(true);
				setStillFails(
					couldNotSimulate(error)
						? {
								title: COPY.recheck.couldNotRunTitle,
								message: COPY.recheck.couldNotRun(reason),
							}
						: {
								title: COPY.recheck.stillFailsTitle,
								message: COPY.recheck.stillFails(reason),
							},
				);
			},
		});
	};

	const cancelButton = (variant: 'outline' | 'default') =>
		canCancel && (
			<Button
				variant={variant}
				onClick={() => setCancelling(true)}
				disabled={
					!settled ||
					sign.isPending ||
					rechecking ||
					isExecuting
				}
				data-testid="cancel-proposal-button"
			>
				{signed && status === 'pending' && <X />}
				{SHARED.cancelProposal}
			</Button>
		);

	let actions: ReactNode = null;
	if (canAct) {
		if (
			isExecuting &&
			(status === 'pending' || status === 'ready')
		) {
			// From Execute or from Sign and execute.
			actions = (
				<ButtonRow>
					<Button
						disabled
						data-testid="execute-proposal-button"
					>
						<Play />
						{SHARED.executing}
					</Button>
				</ButtonRow>
			);
		} else if (refusing) {
			actions = (
				<>
					<Alert
						variant="error"
						data-testid="sign-refused"
						data-rule={refused}
					>
						<div className="font-medium">
							{COPY.refused.title}
						</div>
						<div>
							{signRefusedLine(refused, network)}
							{refused === 'proposer' && (
								<>
									{' '}
									<LearnMoreLink path={PROPOSER_DOCS} />
								</>
							)}
						</div>
					</Alert>
					<ButtonRow>{cancelButton('outline')}</ButtonRow>
				</>
			);
		} else if (unchecked) {
			actions = (
				<>
					<SignersUnchecked
						network={network}
						testId="sign-unchecked"
					/>
					<ButtonRow>{cancelButton('outline')}</ButtonRow>
				</>
			);
		} else if (status === 'pending' && !signed) {
			actions = (
				<>
					{proposer.check === 'unverified' && (
						<Alert
							variant="warning"
							data-testid="proposer-unconfirmed"
						>
							<div className="font-medium">
								{COPY.proposerNotConfirmed.title}
							</div>
							<div>
								{COPY.proposerNotConfirmed.body}{' '}
								<LearnMoreLink path={PROPOSER_DOCS} />
							</div>
						</Alert>
					)}
					{offerExecuteAfterSigning && (
						<label className="flex w-fit cursor-pointer items-center gap-2 text-13">
							<Checkbox
								checked={executeAfterSigning}
								onCheckedChange={setExecuteAfterSigning}
								disabled={sign.isPending}
								data-testid="execute-after-signing"
							/>
							{COPY.executeAfterSigning}
						</label>
					)}
					<ButtonRow>
						{/* While signing the button has the row to itself, as Executing… does. */}
						{!sign.isPending &&
							cancelButton(failing ? 'default' : 'outline')}
						<Button
							variant={failing ? 'outline' : 'default'}
							onClick={onSign}
							disabled={
								!settled ||
								sign.isPending ||
								checkingSigners ||
								proposer.pending
							}
							data-testid="sign-proposal-button"
						>
							{(failing || signAndExecute) && <Pen />}
							{signLabel()}
						</Button>
					</ButtonRow>
				</>
			);
		} else if (status === 'pending' && signed) {
			actions = (
				<ButtonRow>{cancelButton('outline')}</ButtonRow>
			);
		} else if (status === 'ready') {
			actions = (
				<ButtonRow>
					{cancelButton('outline')}
					<Button
						onClick={onExecute}
						disabled={!settled || rechecking}
						data-testid="execute-proposal-button"
					>
						<Play />
						{rechecking ? COPY.simulating : SHARED.execute}
					</Button>
				</ButtonRow>
			);
		} else if (status === 'expired') {
			actions = (
				<ButtonRow>{cancelButton('outline')}</ButtonRow>
			);
		}
	}

	return (
		<section
			className={cardClass}
			aria-labelledby="approvals-heading"
			data-testid="approvals-card"
		>
			<CardHeading
				id="approvals-heading"
				title={COPY.heading}
			>
				<span
					className="ml-auto text-12 text-muted-foreground"
					data-testid="approvals-threshold"
				>
					{mainSet
						? mainSet.heading
						: shownSet && approvalsThresholdLabel(shownSet)}
				</span>
			</CardHeading>
			{statusLine && (
				<p
					className="text-13 text-muted-foreground"
					data-testid="approvals-status"
				>
					{statusLine}
				</p>
			)}
			<div className="border-t" />
			{signerSets && mainSet ? (
				<>
					<p
						className="text-13 text-muted-foreground"
						data-testid="approvals-several-signer-sets"
					>
						{content.common.severalSignerSets(
							signerSets.length,
							networkLabel(network),
						)}
					</p>
					<div
						className="flex flex-col gap-3"
						{...signerSetData(mainSet)}
					>
						<ApprovalRowList rows={mainSet.rows} />
					</div>
					<FoldedRow
						label={content.common.moreSignerSets(
							foldedSets.length,
						)}
						line={foldedSignerSetsLine(signerSets, status)}
						testId="approvals-other-signer-sets"
					>
						{foldedSets.map((set, i) => (
							<div
								key={set.address}
								className={cn(
									'flex flex-col gap-3',
									i > 0 && 'border-t pt-4',
								)}
								{...signerSetData(set)}
							>
								<div className="flex flex-col gap-0.5">
									{set.podName ? (
										<span className="text-13 font-medium">
											{set.podName}
										</span>
									) : (
										<ShortAddress
											address={set.address}
											className="w-fit font-mono text-12"
										/>
									)}
									<div className="flex flex-wrap items-baseline justify-between gap-x-3">
										<span className="text-13">
											{set.heading}
										</span>
										{set.line && (
											<span className="text-12 text-muted-foreground">
												{set.line}
											</span>
										)}
									</div>
								</div>
								<ApprovalRowList rows={set.rows} />
							</div>
						))}
					</FoldedRow>
				</>
			) : (
				<ApprovalRowList rows={rows} />
			)}

			{actions && (
				<div className="mt-1 flex flex-col gap-3">
					{actions}
				</div>
			)}
			{note && !refusing && !unchecked && (
				<p
					className="text-12 text-muted-foreground"
					data-testid={
						viewer === 'outsider' &&
						(status === 'pending' ||
							status === 'ready' ||
							status === 'expired')
							? 'preview-cannot-sign'
							: 'approvals-note'
					}
				>
					{note}
				</p>
			)}

			<CancelProposalModal
				open={cancelling}
				onClose={() => setCancelling(false)}
				onConfirm={() =>
					cancel.mutate(proposal, {
						onSuccess: () => setCancelling(false),
					})
				}
				isLoading={cancel.isPending}
				title={proposalTitle(proposal)}
				variant={cancelVariant(proposal, viewerPublicKey)}
				ready={status === 'ready'}
			/>
			<Modal
				open={askingToExecute}
				onClose={() => setAskingToExecute(false)}
				className="sm:max-w-105"
				data-testid="execute-anyway-dialog"
			>
				<ModalHeader
					title={
						stillFails?.title ??
						COPY.recheck.stillFailsTitle
					}
				/>
				<ModalContent>
					<p>
						{stillFails &&
							COPY.executeAnyway.body(
								stillFails.message,
								gas,
							)}
					</p>
				</ModalContent>
				<ModalActions>
					<Button
						variant="outline"
						onClick={() => setAskingToExecute(false)}
						data-testid="execute-anyway-back"
					>
						{ACTIONS.goBack}
					</Button>
					<Button
						variant="destructive"
						onClick={() => {
							setAskingToExecute(false);
							if (readySet) execute(proposal, readySet);
						}}
						data-testid="execute-anyway-button"
					>
						{COPY.executeAnyway.confirm}
					</Button>
				</ModalActions>
			</Modal>
		</section>
	);
}

/** A signer set's block attributes, so each set's count can be read. */
function signerSetData(set: ApprovalsSignerSet) {
	return {
		'data-testid': 'approvals-signer-set',
		'data-address': set.address,
		'data-current-weight': set.currentWeight,
		'data-threshold': set.threshold,
	};
}

function ApprovalRowList({
	rows,
}: {
	rows: ApprovalRow[];
}) {
	return (
		<ul className="flex flex-col gap-3">
			{rows.map((row) => (
				<li
					key={row.publicKey}
					className="flex items-center gap-3"
					data-testid="approval-row"
					data-address={row.address ?? undefined}
					data-signed={row.signed}
				>
					<span
						aria-hidden
						className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-11 font-medium"
					>
						{row.initial}
					</span>
					<div className="flex min-w-0 flex-1">
						<SignerName
							label={row.label}
							address={row.address ?? undefined}
							marker={row.isYou ? 'you' : null}
							markerStyle="parens"
							size="md"
						/>
					</div>
					{row.signed ? (
						<Chip
							variant="info"
							data-testid={
								row.isYou
									? 'proposal-already-signed'
									: undefined
							}
						>
							{STATES.signed}
						</Chip>
					) : (
						<span className="shrink-0 text-12 text-muted-foreground">
							{row.state === 'not-needed'
								? COPY.notNeeded
								: STATES.notSigned}
						</span>
					)}
				</li>
			))}
		</ul>
	);
}

/** The card's buttons, sharing the width. */
function ButtonRow({ children }: { children: ReactNode }) {
	return (
		<div className="grid auto-cols-fr grid-flow-col gap-2">
			{children}
		</div>
	);
}
