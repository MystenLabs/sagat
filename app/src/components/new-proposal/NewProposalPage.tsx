// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from 'react';
import {
	Navigate,
	useNavigate,
	useParams,
	useSearchParams,
} from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonPage } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
	WizardStepper,
	type WizardStep,
} from '@/components/wizard/parts';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import {
	SignatureDeclinedError,
	useCreateProposal,
} from '@/hooks/useCreateProposal';
import { useGetMultisig } from '@/hooks/useGetMultisig';
import { useTransactionPreview } from '@/hooks/useTransactionPreview';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import { accountSetup } from '@/lib/account-setup';
import {
	COPY,
	proposalTypeFromQuery,
	type ProposalType,
	type TransferDraft,
} from '@/lib/new-proposal';
import { toast } from '@/lib/toast';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

import { BytesDetailsStep } from './BytesDetailsStep';
import { ReviewStep } from './ReviewStep';
import {
	FromCard,
	HelpCard,
	NextStepsCard,
} from './SideCards';
import { TransferDetailsStep } from './TransferDetailsStep';
import { TypeStep } from './TypeStep';

const STEPS = ['Type', 'Details', 'Review'] as const;

/**
 * The new-proposal wizard: type, details, review. Waits for the account
 * list like the account pages, and leaves for the dashboard when the
 * account isn't one of the signed-in key's accepted accounts.
 */
export function NewProposalPage() {
	const { address } = useParams<{ address: string }>();
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
		return <SkeletonPage message="Loading account" />;
	}
	if (!multisig) return <Navigate to="/" replace />;

	return (
		<NewProposalWizard
			key={multisig.address}
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
	const { dryRun, analysis, preview } =
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
		multisig.members.find(
			(m) => m.publicKey === currentAddress?.publicKey,
		)?.weight ?? null;

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
			coinType: searchParams.get('asset') ?? '',
			amount: '',
			recipient: '',
		});
	const [bytesDraft, setBytesDraft] = useState('');
	// Null until edited: Details shows the title it generates.
	const [title, setTitle] = useState<string | null>(null);
	// The built transaction and the title Details had when it was built.
	// Set by Details' Review, cleared when the type or the draft changes.
	const [ready, setReady] = useState<{
		bytes: string;
		title: string;
	} | null>(null);

	const creating = create.isPending;
	const address = multisig.address;
	const proposalsPath = `/multisig/${address}/proposals`;
	const cancel = () => navigate(proposalsPath);

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
	// and forward again keeps the result.
	const previewed = useRef<string | null>(null);
	useEffect(() => {
		if (step !== 3 || !ready) return;
		if (previewed.current === ready.bytes) return;
		previewed.current = ready.bytes;
		preview(ready.bytes);
	}, [step, ready, preview]);

	const reviewTitle = title ?? ready?.title ?? '';

	const submit = () => {
		if (!ready) return;
		create.mutate(
			{
				multisigAddress: address,
				transactionData: ready.bytes,
				description: reviewTitle.trim(),
			},
			{
				onSuccess: () => navigate(proposalsPath),
				onError: (error) => {
					if (error instanceof SignatureDeclinedError)
						toast.error(COPY.signatureDeclined);
				},
			},
		);
	};
	// A declined signature is the toast alone; anything else is the
	// notice on Review.
	const createError =
		create.error &&
		!(create.error instanceof SignatureDeclinedError)
			? COPY.createFailed
			: null;

	const detailsProps = {
		multisig,
		title,
		onTitleChange: setTitle,
		onReady: (next: { bytes: string; title: string }) => {
			setReady(next);
			goTo(3);
		},
		onBack: () => goTo(1),
		onCancel: cancel,
	};

	return (
		<TooltipProvider delay={150}>
			<div
				className="page-shell @container"
				data-testid="new-proposal-page"
			>
				{/* The content stays 1092px wide, as designed, so Cancel ends where
				    the side column does on wide screens. */}
				<div className="w-full max-w-273">
					<PageHeader
						breadcrumb={[
							{ label: 'Proposals', to: proposalsPath },
							{ label: 'New proposal' },
						]}
						title="New proposal"
						actions={
							<Button
								variant="ghost"
								onClick={cancel}
								disabled={creating}
								className="max-sm:hidden"
								data-testid="new-proposal-cancel"
							>
								Cancel
							</Button>
						}
					/>

					<WizardStepper
						steps={STEPS}
						step={step}
						reach={reach}
						disabled={creating}
						onStep={goTo}
						testId="new-proposal-stepper"
					/>

					{/* Stacked below 896px of content, where the card and the side
					    cards fill the row; two columns from there. */}
					<div className="mt-7 flex flex-col gap-8 @4xl:flex-row @4xl:items-start">
						<div
							// Remounting on each step change plays the entrance.
							key={step}
							ref={cardRef}
							className={cn(
								'@container/card w-full min-w-0 rounded-xl border bg-card @4xl:max-w-185 @4xl:flex-1',
								'animate-in fade-in duration-200 ease-out motion-reduce:animate-none',
								direction === 'forward'
									? 'slide-in-from-right-2'
									: 'slide-in-from-left-2',
							)}
						>
							{step === 1 && (
								<TypeStep
									type={type}
									onTypeChange={(next) => {
										if (next === type) return;
										setType(next);
										setReady(null);
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
											setReady(null);
										}}
									/>
								) : (
									<BytesDetailsStep
										{...detailsProps}
										draft={bytesDraft}
										onDraftChange={(next) => {
											setBytesDraft(next);
											setReady(null);
										}}
									/>
								))}
							{step === 3 && ready && (
								<ReviewStep
									multisig={multisig}
									bytes={ready.bytes}
									title={reviewTitle}
									onTitleChange={setTitle}
									dryRun={dryRun}
									analysis={analysis}
									creating={creating}
									createError={createError}
									onSubmit={submit}
									onBack={() => goTo(2)}
									onCancel={cancel}
								/>
							)}
						</div>

						<div
							// The side column only changes at Review, so it fades
							// just then.
							key={step === 3 ? 'next-steps' : 'from'}
							className={cn(
								'flex w-full flex-col gap-5 animate-in fade-in duration-200 motion-reduce:animate-none @4xl:shrink-0',
								step === 3 ? '@4xl:w-90' : '@4xl:w-80',
							)}
						>
							{step === 3 ? (
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
							)}
						</div>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}
