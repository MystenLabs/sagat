// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Pen, Play, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { CancelProposalModal } from '@/components/modals/CancelProposalModal';
import { SignerName } from '@/components/multisig/SignerName';
import type { SimulationProps } from '@/components/transaction-preview/simulation';
import { Button } from '@/components/ui/button';
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
import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useCancelProposal } from '@/hooks/useCancelProposal';
import {
	couldNotSimulate,
	useDryRun,
} from '@/hooks/useDryRun';
import { useExecuteOrVerify } from '@/hooks/useExecuteProposal';
import { useSignProposal } from '@/hooks/useSignProposal';
import {
	approvalRows,
	approvalsNote,
	approvalsStatus,
	approvalsThresholdLabel,
	cancelVariant,
	gasEstimate,
	hasSigned,
	withReason,
	wouldReachThreshold,
	type ApprovalsNoteInput,
	type Labels,
	type SimulationVerdict,
} from '@/lib/proposal-page';
import {
	proposalTitle,
	type ProposalStatusKey,
} from '@/lib/proposalUtils';
import { type ProposalCardInput } from '@/lib/types';
import { safeDecode } from '@/lib/utils';

const COPY = content.proposal.approvals;
const SHARED = content.proposal.shared;
const ACTIONS = content.common.actions;
const STATES = content.common.states;

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
	simulation,
	verdict,
	canCancel: cancelAllowed,
}: {
	proposal: ProposalCardInput;
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
	const execute = (target: ProposalCardInput) => {
		setSettling(true);
		executing.execute(target, {
			onError: () => setSettling(false),
		});
	};
	const rechecking = recheck.isPending;
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
	// proposal executes; when it still fails, or can't run this time, the
	// viewer is asked.
	const onExecute = () => {
		if (!failing) {
			execute(proposal);
			return;
		}
		recheck.mutate(proposal.transactionBytes, {
			onSuccess: () => execute(proposal),
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
							{COPY.executeAfterSigning}
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
								? STATES.signing
								: failing
									? COPY.signAnyway
									: signAndExecute
										? ACTIONS.signAndExecute
										: COPY.signProposal}
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
					{approvalsThresholdLabel(proposal.multisig)}
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
						{stillFails?.message}
						{COPY.executeAnyway.body(gas)}
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
							execute(proposal);
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

/** The card's buttons, sharing the width. */
function ButtonRow({ children }: { children: ReactNode }) {
	return (
		<div className="grid auto-cols-fr grid-flow-col gap-2">
			{children}
		</div>
	);
}
