// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { SagatApiError } from '@mysten/sagat';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
	WizardStepper,
	type WizardStep,
} from '@/components/wizard/parts';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useCreateMultisig } from '@/hooks/useCreateMultisig';
import { usePublicKeyLookups } from '@/hooks/usePublicKeyLookups';
import { CONFIG } from '@/lib/constants';
import {
	addressInput,
	checkSigners,
	COPY,
	invitedName,
	nameError,
	stripHiddenCharacters,
	type SignerDraft,
} from '@/lib/create-multisig';
import { cn } from '@/lib/utils';

import { NameStep } from './NameStep';
import { ReviewStep } from './ReviewStep';
import {
	HelpCard,
	NextStepsCard,
	PreviewCard,
	PreviewStrip,
} from './SideCards';
import { SignersStep } from './SignersStep';

const STEPS = [
	'Name',
	'Signers and threshold',
	'Review',
] as const;

// The API's reasons worth showing as they are; anything else gets the
// general message.
const SHOWN_STATUSES = [400, 409, 422];

const newSigner = (id: number): SignerDraft => ({
	id: `signer-${id}`,
	label: '',
	key: '',
	weight: 1,
});

/**
 * The create wizard: name, signers and threshold, review. The draft lives
 * in this component, so leaving the page discards it.
 */
export function CreateMultisigPage() {
	const navigate = useNavigate();
	const currentAccount = useCurrentAccount();
	const { currentAddress } = useApiAuth();
	const { isTestMode } = useNetwork();
	const create = useCreateMultisig();

	const [step, setStep] = useState<WizardStep>(1);
	// Which way the last step change went, so the new step slides in
	// from that side.
	const [direction, setDirection] = useState<
		'forward' | 'back'
	>('forward');
	const [signersOpened, setSignersOpened] = useState(false);
	const [name, setName] = useState('');
	const [drafts, setDrafts] = useState<SignerDraft[]>([
		{
			id: 'creator',
			label: '',
			key: '',
			weight: 1,
			isCreator: true,
		},
	]);
	const [threshold, setThreshold] = useState(1);
	// Row ids live with the draft, not in the module: a module counter
	// restarts on hot reload and hands a new row an id already in use.
	const signerIds = useRef(0);
	const [focusId, setFocusId] = useState<string | null>(
		null,
	);

	// The creator's name is their wallet's account name (cut to the label
	// limit) until they edit it; the key always follows the wallet.
	const [creatorNamed, setCreatorNamed] = useState(false);
	const walletLabel = [
		...stripHiddenCharacters(currentAccount?.label ?? ''),
	]
		.slice(0, CONFIG.MAX_KEY_LABEL_LENGTH)
		.join('');
	const creatorKey = currentAddress?.publicKey ?? '';
	const signers = useMemo(
		() =>
			drafts.map((d) =>
				d.isCreator
					? {
							...d,
							key: creatorKey,
							label: creatorNamed ? d.label : walletLabel,
						}
					: d,
			),
		[drafts, creatorKey, creatorNamed, walletLabel],
	);

	// An address pasted into a key field is swapped for its key once found.
	const onKeyFound = useCallback(
		(address: string, publicKey: string) =>
			setDrafts((prev) =>
				prev.map((d) =>
					!d.isCreator && addressInput(d.key) === address
						? { ...d, key: publicKey }
						: d,
				),
			),
		[],
	);
	const failedLookups = usePublicKeyLookups(
		signers.flatMap((s) => {
			const address = addressInput(s.key);
			return address ? [address] : [];
		}),
		onKeyFound,
	);

	// Parses every key and derives the address, so it reruns only when
	// the signers, the threshold or the lookups change.
	const check = useMemo(
		() =>
			checkSigners({
				signers,
				threshold,
				lookups: failedLookups,
			}),
		[signers, threshold, failedLookups],
	);
	// The threshold never exceeds the weight of every row, complete or
	// not, so clearing a key for a moment doesn't lower it for good.
	const maxThreshold = Math.max(
		signers.reduce((sum, s) => sum + s.weight, 0),
		1,
	);
	if (threshold > maxThreshold) setThreshold(maxThreshold);

	// The furthest step whose earlier steps are all valid: the stepper
	// goes that far, the same as Continue would.
	const reach: WizardStep = nameError(name)
		? 1
		: check.canContinue
			? 3
			: 2;

	const invited = useMemo(
		() =>
			signers.filter((s) => !s.isCreator).map(invitedName),
		[signers],
	);

	const submit = () =>
		create.mutate({
			request: {
				name: name.trim(),
				publicKeys: signers.map((s) => s.key.trim()),
				weights: signers.map((s) => s.weight),
				threshold,
				labels: signers.map((s) => s.label.trim() || null),
			},
			invited,
		});

	const creating = create.isPending;
	const cancel = () => navigate('/');

	// Resetting a pending create would detach it and enable Create again,
	// so the steps stay put until it settles.
	const goTo = (next: WizardStep) => {
		if (creating) return;
		create.reset();
		setFocusId(null);
		setDirection(next > step ? 'forward' : 'back');
		setStep(next);
		if (next === 2) setSignersOpened(true);
		window.scrollTo({ top: 0 });
	};

	// A 400, 409 or 422 means the API refused the setup and says why;
	// anything else (offline, 5xx, auth) gets the general message.
	const createError = create.error
		? create.error instanceof SagatApiError &&
			SHOWN_STATUSES.includes(create.error.status)
			? create.error.message
			: COPY.createFailed
		: null;

	// A new step's heading takes focus, so a screen reader starts there.
	// Step 1 focuses its name field instead.
	const cardRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (step === 1) return;
		cardRef.current
			?.querySelector<HTMLElement>('h2')
			?.focus({ preventScroll: true });
	}, [step]);

	return (
		<TooltipProvider delay={150}>
			<div
				className="page-shell @container"
				data-testid="create-page"
			>
				{/* The content stays 1092px wide, as designed, so Cancel ends where
				    the side column does on wide screens. */}
				<div className="w-full max-w-273">
					<PageHeader
						breadcrumb={[
							{ label: 'Multisigs', to: '/' },
							{ label: 'Create a multisig' },
						]}
						title="Create a multisig"
						actions={
							<Button
								variant="ghost"
								onClick={cancel}
								disabled={creating}
								className="max-sm:hidden"
								data-testid="create-cancel"
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
						testId="create-stepper"
					/>
					{step === 2 && (
						// While the preview card sits below the form, its
						// numbers stay in sight here.
						<PreviewStrip
							signers={check.completeCount}
							incomplete={check.incompleteCount}
							totalWeight={check.totalWeight}
							threshold={threshold}
							address={check.address}
							className="mt-5 @4xl:hidden"
						/>
					)}

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
								<NameStep
									name={name}
									onNameChange={setName}
									onContinue={() => goTo(2)}
									onCancel={cancel}
								/>
							)}
							{step === 2 && (
								<SignersStep
									signers={signers}
									check={check}
									threshold={threshold}
									maxThreshold={maxThreshold}
									focusId={focusId}
									onSignersChange={(next) => {
										// Once the creator types in their name field, it
										// stops following the wallet.
										if (
											next.some(
												(d) =>
													d.isCreator &&
													d.label !== walletLabel,
											)
										)
											setCreatorNamed(true);
										setDrafts(next);
										setFocusId(null);
									}}
									onAddSigner={() => {
										const signer = newSigner(
											++signerIds.current,
										);
										setDrafts((prev) => [...prev, signer]);
										setFocusId(signer.id);
									}}
									onThresholdChange={setThreshold}
									onBack={() => goTo(1)}
									onContinue={() => goTo(3)}
									onCancel={cancel}
								/>
							)}
							{step === 3 && check.address && (
								<ReviewStep
									name={name}
									signers={signers}
									threshold={threshold}
									totalWeight={check.totalWeight}
									address={check.address}
									creating={creating}
									error={createError}
									onEditName={() => goTo(1)}
									onEditSigners={() => goTo(2)}
									onBack={() => goTo(2)}
									onCreate={submit}
									onCancel={cancel}
								/>
							)}
						</div>

						<div
							// The side column only changes at Review, so it fades
							// just then.
							key={step === 3 ? 'next-steps' : 'preview'}
							className="flex w-full flex-col gap-5 animate-in fade-in duration-200 motion-reduce:animate-none @4xl:w-80 @4xl:shrink-0"
						>
							{step === 3 ? (
								<NextStepsCard
									name={name.trim()}
									invited={invited}
									threshold={threshold}
									totalWeight={check.totalWeight}
									isTestMode={isTestMode}
								/>
							) : (
								<>
									<PreviewCard
										name={name}
										setUp={signersOpened}
										signers={check.completeCount}
										incomplete={check.incompleteCount}
										totalWeight={check.totalWeight}
										threshold={threshold}
										address={check.address}
										addressMessage={check.addressMessage}
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
