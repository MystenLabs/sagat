// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from 'react';
import {
	Navigate,
	useNavigate,
	useParams,
	useSearchParams,
} from 'react-router-dom';

import { SkeletonPage } from '@/components/ui/skeleton';
import { type WizardStep } from '@/components/wizard/parts';
import { WizardPage } from '@/components/wizard/WizardPage';
import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import {
	SignatureDeclinedError,
	useCreateProposal,
} from '@/hooks/useCreateProposal';
import { couldNotSimulate } from '@/hooks/useDryRun';
import { useGetMultisig } from '@/hooks/useGetMultisig';
import { useTransactionPreview } from '@/hooks/useTransactionPreview';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import { accountSetup } from '@/lib/account-setup';
import { shownApiError } from '@/lib/api-errors';
import { normalizeCoinType } from '@/lib/coin-type';
import {
	proposalTypeFromQuery,
	type ProposalType,
	type ReadyProposal,
	type TransferDraft,
} from '@/lib/new-proposal';
import {
	proposalPagePath,
	proposalsPath,
} from '@/lib/proposalUtils';
import { signerRows } from '@/lib/signers';
import { toast } from '@/lib/toast';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { BytesDetailsStep } from './BytesDetailsStep';
import { ReviewStep } from './ReviewStep';
import {
	FromCard,
	HelpCard,
	NextStepsCard,
} from './SideCards';
import { TransferDetailsStep } from './TransferDetailsStep';
import { TypeStep } from './TypeStep';

const STEPS = content.newProposal.steps;
const COPY = content.newProposal;

/**
 * The new-proposal wizard: type, details, review. Waits for the account
 * list like the account pages, and leaves for the dashboard when the
 * account isn't one of the signed-in key's accepted accounts.
 */
export function NewProposalPage() {
	const { address } = useParams<{ address: string }>();
	const { network } = useNetwork();
	const {
		data: multisigs,
		isLoading,
		isFetching,
	} = useUserMultisigs();
	const multisig = multisigs?.find(
		(m) => m.address === address && m.isAccepted,
	);

	// Also wait while the list refreshes without this account (just
	// joined), rather than redirecting on the stale list.
	if (isLoading || (isFetching && !multisig)) {
		return (
			<SkeletonPage
				message={content.common.states.loadingPod}
			/>
		);
	}
	if (!multisig) return <Navigate to="/" replace />;

	// A new account or network starts a new draft: balances, coins and
	// the built transaction are per network.
	return (
		<NewProposalWizard
			key={`${network}:${multisig.address}`}
			multisig={multisig}
		/>
	);
}

/**
 * The draft lives here, so leaving the page discards it. `?type=` opens
 * on Details for that type and `?asset=` preselects the coin to send.
 */
function NewProposalWizard({
	multisig: listed,
}: {
	multisig: MultisigWithMembersForPublicKey;
}) {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { currentAddress } = useApiAuth();
	const { network } = useNetwork();
	const create = useCreateProposal();
	const { dryRun, analysis, preview, reset } =
		useTransactionPreview();

	// The account query keeps the weights fresh; the list's copy stands
	// in until it answers, or when it fails.
	const { data: details } = useGetMultisig(listed.address);
	const multisig: MultisigWithMembersForPublicKey = details
		? { ...listed, ...details }
		: listed;
	const setup = accountSetup({
		multisig,
		currentAddress: currentAddress?.address,
	});
	const yourWeight =
		signerRows(
			multisig.members,
			currentAddress?.address,
		).find((row) => row.isYou)?.member.weight ?? null;

	const queryType = proposalTypeFromQuery(
		searchParams.get('type'),
	);
	const [step, setStep] = useState<WizardStep>(
		queryType ? 2 : 1,
	);
	// Which way the last step change went, so the new step slides in
	// from that side.
	const [direction, setDirection] = useState<
		'forward' | 'back'
	>('forward');
	const [type, setType] = useState<ProposalType>(
		queryType ?? 'transfer',
	);
	const [transferDraft, setTransferDraft] =
		useState<TransferDraft>({
			// Long form, as the balances have it; '' when not a type.
			coinType: normalizeCoinType(
				searchParams.get('asset') ?? '',
			),
			amount: '',
			recipient: '',
		});
	const [bytesDraft, setBytesDraft] = useState('');
	// Null until edited: Details shows the title it generates.
	const [title, setTitle] = useState<string | null>(null);
	// The built transaction and the title Details had when it was built.
	// Set by Details' Review, cleared when the type or the draft changes.
	const [ready, setReady] = useState<ReadyProposal | null>(
		null,
	);

	const creating = create.isPending;
	const address = multisig.address;
	const proposalsLink = proposalsPath(address);
	const cancel = () => navigate(proposalsLink);

	// The furthest step the stepper goes to: Review once there is a
	// transaction to review.
	const reach: WizardStep = ready ? 3 : 2;

	// Set by goTo, so the first render keeps focus where it is.
	const focusHeading = useRef(false);
	// Resetting a pending create would detach it and enable Propose
	// again, so the steps stay put until it settles.
	const goTo = (next: WizardStep) => {
		if (creating) return;
		create.reset();
		focusHeading.current = true;
		setDirection(next > step ? 'forward' : 'back');
		setStep(next);
		window.scrollTo({ top: 0 });
	};

	// A new step's heading takes focus, so a screen reader starts there.
	const cardRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!focusHeading.current) return;
		focusHeading.current = false;
		cardRef.current
			?.querySelector<HTMLElement>('h2')
			?.focus({ preventScroll: true });
	}, [step]);

	// Simulate each transaction once, when Review first shows it. Back
	// and forward again keeps the result, unless the simulation couldn't
	// run.
	const previewed = useRef<string | null>(null);
	// The type or the draft changed: the transaction and its simulation
	// are stale.
	const clearReady = () => {
		setReady(null);
		reset();
		previewed.current = null;
	};
	useEffect(() => {
		if (step !== 3 || !ready) return;
		if (previewed.current === ready.bytes) return;
		previewed.current = ready.bytes;
		preview(ready.bytes);
	}, [step, ready, preview]);
	const simulationUnreachable =
		dryRun.isError && couldNotSimulate(dryRun.error);
	useEffect(() => {
		if (simulationUnreachable) previewed.current = null;
	}, [simulationUnreachable]);
	const retrySimulation = () => {
		if (!ready) return;
		previewed.current = ready.bytes;
		preview(ready.bytes);
	};

	const reviewTitle = title ?? ready?.title ?? '';

	// Propose is disabled only once React re-renders with the create
	// pending, so a second click in the same tick still lands here.
	const submitting = useRef(false);
	const submit = () => {
		if (!ready || create.isPending || submitting.current)
			return;
		submitting.current = true;
		create.mutate(
			{
				multisigAddress: address,
				transactionData: ready.bytes,
				// The length check counts the NFC form (`textLength`), and
				// the API stores what it gets, so send that form: typed as
				// conjoining jamo, a title is up to three times longer.
				description:
					reviewTitle.normalize('NFC').trim() || undefined,
			},
			{
				onSuccess: (proposal) =>
					// Replaced, so Back leaves for where the wizard opened from.
					navigate(
						proposalPagePath(address, proposal.digest),
						{ replace: true },
					),
				onError: (error) => {
					if (error instanceof SignatureDeclinedError)
						toast.error(COPY.signatureDeclined);
				},
				onSettled: () => {
					submitting.current = false;
				},
			},
		);
	};
	// A declined signature is the toast alone; anything else is the
	// notice on Review, with the API's reason when it refused the
	// proposal (a coin another pending proposal uses, say).
	const createError =
		create.error &&
		!(create.error instanceof SignatureDeclinedError)
			? shownApiError(create.error, COPY.createFailed)
			: null;

	const detailsProps = {
		multisig,
		title,
		onTitleChange: setTitle,
		onReady: (next: ReadyProposal) => {
			setReady(next);
			goTo(3);
		},
		onBack: () => goTo(1),
		onCancel: cancel,
	};

	return (
		<WizardPage
			title={COPY.title}
			breadcrumb={[
				{
					label: COPY.breadcrumbProposals,
					to: proposalsLink,
				},
				{ label: COPY.title },
			]}
			testId="new-proposal"
			steps={STEPS}
			step={step}
			reach={reach}
			onStep={goTo}
			busy={creating}
			onCancel={cancel}
			direction={direction}
			cardRef={cardRef}
			// The side column only changes at Review, so it fades just then.
			sideKey={step === 3 ? 'next-steps' : 'from'}
			sideClassName={step === 3 ? '@4xl:w-90' : '@4xl:w-80'}
			side={
				step === 3 ? (
					<NextStepsCard
						threshold={setup.threshold}
						yourWeight={yourWeight}
					/>
				) : (
					<>
						<FromCard
							multisig={multisig}
							network={network}
							yourWeight={yourWeight}
						/>
						<HelpCard />
					</>
				)
			}
		>
			{step === 1 && (
				<TypeStep
					type={type}
					onTypeChange={(next) => {
						if (next === type) return;
						setType(next);
						setTitle(null);
						clearReady();
					}}
					onContinue={() => goTo(2)}
					onCancel={cancel}
				/>
			)}
			{step === 2 &&
				(type === 'transfer' ? (
					<TransferDetailsStep
						{...detailsProps}
						draft={transferDraft}
						onDraftChange={(next) => {
							setTransferDraft(next);
							clearReady();
						}}
					/>
				) : (
					<BytesDetailsStep
						{...detailsProps}
						draft={bytesDraft}
						onDraftChange={(next) => {
							setBytesDraft(next);
							clearReady();
						}}
					/>
				))}
			{step === 3 && ready && (
				<ReviewStep
					bytes={ready.bytes}
					sender={{
						address: multisig.address,
						name: multisig.name ?? null,
					}}
					title={reviewTitle}
					onTitleChange={setTitle}
					dryRun={dryRun}
					analysis={analysis}
					creating={creating}
					createError={createError}
					onRetrySimulation={retrySimulation}
					onSubmit={submit}
					onBack={() => goTo(2)}
					onCancel={cancel}
				/>
			)}
		</WizardPage>
	);
}
