// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { SagatApiError } from '@mysten/sagat';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useCreateMultisig } from '@/hooks/useCreateMultisig';
import { usePublicKeyLookups } from '@/hooks/usePublicKeyLookups';
import { CONFIG } from '@/lib/constants';
import {
	addressInput,
	checkSigners,
	invitedName,
	nameError,
	type SignerDraft,
} from '@/lib/create-multisig';
import { cn } from '@/lib/utils';

import { NameStep } from './NameStep';
import { WizardStepper, type WizardStep } from './parts';
import { ReviewStep } from './ReviewStep';
import {
	HelpCard,
	NextStepsCard,
	PreviewCard,
} from './SideCards';
import { SignersStep } from './SignersStep';

const CREATE_FAILED =
	'Couldn’t create the multisig. Nothing was sent to the signers and your setup is still here. Check your connection and try again.';

let nextId = 0;
const newSigner = (): SignerDraft => ({
	id: `signer-${++nextId}`,
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
	const [focusId, setFocusId] = useState<string | null>(
		null,
	);

	// The creator's name is their wallet's account name (cut to the label
	// limit) until they edit it; the key always follows the wallet.
	const [creatorNamed, setCreatorNamed] = useState(false);
	const walletLabel = [
		...(currentAccount?.label?.trim() ?? ''),
	]
		.slice(0, CONFIG.MAX_KEY_LABEL_LENGTH)
		.join('');
	const signers = drafts.map((d) =>
		d.isCreator
			? {
					...d,
					key: currentAddress?.publicKey ?? '',
					label: creatorNamed ? d.label : walletLabel,
				}
			: d,
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

	const check = checkSigners({
		signers,
		threshold,
		lookups: failedLookups,
	});
	// The threshold never exceeds the total weight.
	const maxThreshold = Math.max(check.totalWeight, 1);
	if (threshold > maxThreshold) setThreshold(maxThreshold);

	// The furthest step whose earlier steps are all valid: the stepper
	// goes that far, the same as Continue would.
	const reach: WizardStep = nameError(name)
		? 1
		: check.canContinue
			? 3
			: 2;

	const invited = signers
		.filter((s) => !s.isCreator)
		.map(invitedName);

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

	const goTo = (next: WizardStep) => {
		create.reset();
		setFocusId(null);
		setDirection(next > step ? 'forward' : 'back');
		setStep(next);
		if (next === 2) setSignersOpened(true);
		window.scrollTo({ top: 0 });
	};

	// A 4xx means the API refused the setup and says why; anything else
	// (offline, 5xx) gets the general message.
	const createError = create.error
		? create.error instanceof SagatApiError &&
			create.error.status >= 400 &&
			create.error.status < 500
			? create.error.message
			: CREATE_FAILED
		: null;

	return (
		<TooltipProvider delay={150}>
			<div
				className="page-shell @container"
				data-testid="create-page"
			>
				<PageHeader
					breadcrumb={[
						{ label: 'Multisigs', to: '/' },
						{ label: 'Create a multisig' },
					]}
					title="Create a multisig"
					actions={
						<Button
							variant="ghost"
							onClick={() => navigate('/')}
							data-testid="create-cancel"
						>
							Cancel
						</Button>
					}
				/>

				<WizardStepper
					step={step}
					reach={reach}
					onStep={goTo}
				/>

				<div className="mt-7 flex flex-col gap-8 @5xl:flex-row @5xl:items-start">
					<div
						// Remounting on each step change plays the entrance.
						key={step}
						className={cn(
							'@container/card w-full max-w-185 min-w-0 rounded-xl border bg-card @5xl:flex-1',
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
							/>
						)}
						{step === 2 && (
							<SignersStep
								signers={signers}
								check={check}
								threshold={threshold}
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
									const signer = newSigner();
									setDrafts((prev) => [...prev, signer]);
									setFocusId(signer.id);
								}}
								onThresholdChange={setThreshold}
								onBack={() => goTo(1)}
								onContinue={() => goTo(3)}
							/>
						)}
						{step === 3 && check.address && (
							<ReviewStep
								name={name}
								signers={signers}
								threshold={threshold}
								totalWeight={check.totalWeight}
								address={check.address}
								creating={create.isPending}
								error={createError}
								onEditName={() => goTo(1)}
								onEditSigners={() => goTo(2)}
								onBack={() => goTo(2)}
								onCreate={submit}
							/>
						)}
					</div>

					<div
						// The side column only changes at Review, so it fades
						// just then.
						key={step === 3 ? 'next-steps' : 'preview'}
						className="flex w-full max-w-185 flex-col gap-5 animate-in fade-in duration-200 motion-reduce:animate-none @5xl:w-80 @5xl:shrink-0"
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
		</TooltipProvider>
	);
}
