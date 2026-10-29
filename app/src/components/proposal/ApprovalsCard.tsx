// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ExternalLink, Pen, Play, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { CancelProposalModal } from '@/components/modals/CancelProposalModal';
import { SignerName } from '@/components/multisig/SignerName';
import type { SimulationProps } from '@/components/transaction-preview/simulation';
import {
	Button,
	buttonVariants,
} from '@/components/ui/button';
import {
	cardClass,
	CardHeading,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import {
	Modal,
	ModalActions,
	ModalContent,
	ModalHeader,
} from '@/components/ui/modal';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useCancelProposal } from '@/hooks/useCancelProposal';
import {
	couldNotSimulate,
	type useDryRun,
} from '@/hooks/useDryRun';
import { useExecuteOrVerify } from '@/hooks/useExecuteProposal';
import { useSignProposal } from '@/hooks/useSignProposal';
import { formatDateTime } from '@/lib/dates';
import {
	approvalRows,
	approvalsNote,
	approvalsStatus,
	cancelVariant,
	gasEstimate,
	hasSigned,
	thresholdLabel,
	trimPeriod,
	wouldReachThreshold,
	type ApprovalsNoteInput,
	type Labels,
	type SimulationVerdict,
} from '@/lib/proposal-page';
import {
	proposalTitle,
	type ProposalStatusKey,
} from '@/lib/proposalUtils';
import type { SimulatedTransaction } from '@/lib/transaction-preview';
import { type ProposalCardInput } from '@/lib/types';
import {
	cn,
	getExplorerUrl,
	safeDecode,
} from '@/lib/utils';

/**
 * Who signed, what the threshold needs, and what the viewer can do
 * about it: sign (and execute, when their signature reaches the
 * threshold), execute, or cancel. Only a signer on the proposal's
 * network gets the buttons.
 */
export function ApprovalsCard({
	proposal,
	status,
	labels,
	viewer,
	viewerPublicKey,
	dryRun,
	simulation,
	verdict,
	chainResult,
	canCancel: cancelAllowed,
}: {
	proposal: ProposalCardInput;
	status: ProposalStatusKey;
	labels: Labels;
	viewer: ApprovalsNoteInput['viewer'];
	/** The viewer's key, when they are a signer. */
	viewerPublicKey: string | null;
	/** The page's dry run, run again before executing a failing one. */
	dryRun: ReturnType<typeof useDryRun>;
	simulation: SimulationProps | null;
	verdict: SimulationVerdict;
	/** The executed transaction, for an executed or failed proposal. */
	chainResult: SimulatedTransaction | null;
	/**
	 * Whether the viewer may cancel: only under the account, where the
	 * API knows them as an accepted member.
	 */
	canCancel: boolean;
}) {
	const { currentAddress } = useApiAuth();
	const sign = useSignProposal();
	const executing = useExecuteOrVerify();
	const cancel = useCancelProposal();
	const [executeAfterSigning, setExecuteAfterSigning] =
		useState(true);
	const [cancelling, setCancelling] = useState(false);
	// Set when an execution starts and cleared only when it fails, so
	// the button stays on Executing… until the proposal refetches as
	// closed instead of flashing back to Execute in between.
	const [settling, setSettling] = useState(false);
	// The second simulation's error, while its dialog is open.
	const [stillFails, setStillFails] = useState<
		string | null
	>(null);

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
	const execute = (target: ProposalCardInput) => {
		setSettling(true);
		executing.execute(target, {
			onError: () => setSettling(false),
		});
	};
	const rechecking = dryRun.isPending && status === 'ready';
	const canAct = viewer === 'member';
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

	const rows = approvalRows(
		proposal,
		status,
		labels,
		viewerPublicKey,
	);
	const statusLine = approvalsStatus(
		proposal,
		status,
		isExecuting,
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
	const explorerUrl = getExplorerUrl(
		proposal.digest,
		proposal.network,
	);

	const onSign = () =>
		sign.mutate(proposal, {
			onSuccess: ({ vote, signature }) => {
				if (
					!vote.hasReachedThreshold ||
					!offerExecuteAfterSigning ||
					!executeAfterSigning ||
					!viewerPublicKey
				)
					return;
				// With the new signature, so it needn't wait for the refetch.
				execute({
					...proposal,
					signatures: [
						...proposal.signatures,
						{
							proposalId: proposal.id,
							publicKey: viewerPublicKey,
							signature,
						},
					],
				});
			},
		});

	// A failing simulation is run again first: when it passes now, the
	// proposal executes; when it still fails, the viewer is asked.
	const onExecute = () => {
		if (!failing) {
			execute(proposal);
			return;
		}
		dryRun.mutate(proposal.transactionBytes, {
			onSuccess: () => execute(proposal),
			onError: (error) => {
				if (couldNotSimulate(error)) execute(proposal);
				else setStillFails(safeDecode(error.message));
			},
		});
	};

	const cancelButton = (variant: 'outline' | 'default') =>
		canCancel && (
			<Button
				variant={variant}
				onClick={() => setCancelling(true)}
				disabled={!settled || sign.isPending}
				data-testid="cancel-proposal-button"
			>
				{signed && status === 'pending' && <X />}
				Cancel proposal
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
						Executing…
					</Button>
				</ButtonRow>
			);
		} else if (status === 'pending' && !signed) {
			actions = (
				<>
					{offerExecuteAfterSigning && (
						<label className="flex w-fit cursor-pointer items-center gap-2 text-13">
							<Checkbox
								checked={executeAfterSigning}
								onCheckedChange={setExecuteAfterSigning}
								disabled={sign.isPending}
								data-testid="execute-after-signing"
							/>
							Execute after signing
						</label>
					)}
					<ButtonRow>
						{cancelButton(failing ? 'default' : 'outline')}
						<Button
							variant={failing ? 'outline' : 'default'}
							onClick={onSign}
							disabled={!settled || sign.isPending}
							data-testid="sign-proposal-button"
						>
							{(failing || signAndExecute) && <Pen />}
							{sign.isPending
								? 'Signing…'
								: failing
									? 'Sign anyway'
									: signAndExecute
										? 'Sign and execute'
										: 'Sign proposal'}
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
						{rechecking ? 'Simulating…' : 'Execute'}
					</Button>
				</ButtonRow>
			);
		} else if (status === 'expired') {
			actions = (
				<ButtonRow>{cancelButton('outline')}</ButtonRow>
			);
		}
	}

	const closedOnChain =
		status === 'executed' || status === 'failed';
	const gasUsed = gasEstimate(chainResult);
	const confirmedAt = formatDateTime(
		chainResult?.timestampMs ?? null,
	);

	return (
		<section
			className={cardClass}
			aria-labelledby="approvals-heading"
			data-testid="approvals-card"
		>
			<CardHeading id="approvals-heading" title="Approvals">
				<span
					className="ml-auto text-12 text-muted-foreground"
					data-testid="approvals-threshold"
				>
					{thresholdLabel(proposal.multisig)}
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
								Signed
							</Chip>
						) : (
							<span className="shrink-0 text-12 text-muted-foreground">
								{row.state === 'not-needed'
									? 'Not needed'
									: 'Not signed'}
							</span>
						)}
					</li>
				))}
			</ul>

			{status === 'executed' && (
				<div
					className="mt-1 flex flex-col gap-0.5 rounded-lg bg-muted/40 p-3 text-13"
					data-testid="proposal-executed"
				>
					<span className="font-medium">Executed</span>
					{(confirmedAt || gasUsed) && (
						<span className="text-12 text-muted-foreground">
							{[confirmedAt, gasUsed && `Gas ${gasUsed}`]
								.filter(Boolean)
								.join(' · ')}
						</span>
					)}
				</div>
			)}
			{closedOnChain && explorerUrl && (
				<a
					href={explorerUrl}
					target="_blank"
					rel="noopener noreferrer"
					className={cn(
						buttonVariants({ variant: 'outline' }),
						'w-full',
					)}
					data-testid="view-on-explorer"
				>
					<ExternalLink />
					View on explorer
				</a>
			)}

			{actions && (
				<div className="mt-1 flex flex-col gap-3">
					{actions}
				</div>
			)}
			{note && (
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
					cancel.mutate(proposal.id, {
						onSuccess: () => setCancelling(false),
					})
				}
				isLoading={cancel.isPending}
				title={proposalTitle(proposal)}
				variant={cancelVariant(proposal, viewerPublicKey)}
				ready={status === 'ready'}
			/>
			<Modal
				open={stillFails !== null}
				onClose={() => setStillFails(null)}
				className="sm:max-w-105"
				data-testid="execute-anyway-dialog"
			>
				<ModalHeader title="Simulation still fails" />
				<ModalContent>
					<p>
						It still fails after a second simulation
						{stillFails
							? `: ${trimPeriod(stillFails)}`
							: ''}
						. If you execute, the proposal closes and can't
						be retried, and the account still pays gas
						{gas ? ` (about ${gas})` : ''}.
					</p>
				</ModalContent>
				<ModalActions>
					<Button
						variant="outline"
						onClick={() => setStillFails(null)}
					>
						Go back
					</Button>
					<Button
						variant="destructive"
						onClick={() => {
							setStillFails(null);
							execute(proposal);
						}}
						data-testid="execute-anyway-button"
					>
						Execute anyway
					</Button>
				</ModalActions>
			</Modal>
		</section>
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
