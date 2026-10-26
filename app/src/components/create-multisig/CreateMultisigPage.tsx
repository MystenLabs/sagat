// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { type WizardStep } from '@/components/wizard/parts';
import { WizardPage } from '@/components/wizard/WizardPage';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useCreateMultisig } from '@/hooks/useCreateMultisig';
import { usePublicKeyLookups } from '@/hooks/usePublicKeyLookups';
import { shownApiError } from '@/lib/api-errors';
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
import { sumWeight } from '@/lib/threshold';

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
	const maxThreshold = Math.max(sumWeight(signers), 1);
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

	const createError = create.error
		? shownApiError(create.error, COPY.createFailed)
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
		<WizardPage
			title="Create a multisig"
			breadcrumb={[
				{ label: 'Multisigs', to: '/' },
				{ label: 'Create a multisig' },
			]}
			testId="create"
			steps={STEPS}
			step={step}
			reach={reach}
			onStep={goTo}
			busy={creating}
			onCancel={cancel}
			direction={direction}
			cardRef={cardRef}
			beforeContent={
				step === 2 && (
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
				)
			}
			// The side column only changes at Review, so it fades just then.
			sideKey={step === 3 ? 'next-steps' : 'preview'}
			side={
				step === 3 ? (
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
				)
			}
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
									d.isCreator && d.label !== walletLabel,
							)
						)
							setCreatorNamed(true);
						setDrafts(next);
						setFocusId(null);
					}}
					onAddSigner={() => {
						const signer = newSigner(++signerIds.current);
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
		</WizardPage>
	);
}
