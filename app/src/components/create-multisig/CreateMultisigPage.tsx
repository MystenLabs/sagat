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
	type SignerDraft,
} from '@/lib/create-multisig';

import { NameStep } from './NameStep';
import { WizardStepper } from './parts';
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

	const [step, setStep] = useState<1 | 2 | 3>(1);
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

	const creatorName = currentAccount?.label?.trim() || null;
	// The creator's key always follows the connected wallet.
	const signers = drafts.map((d) =>
		d.isCreator
			? { ...d, key: currentAddress?.publicKey ?? '' }
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
		creatorName,
	});
	// The threshold never exceeds the total weight.
	const maxThreshold = Math.max(check.totalWeight, 1);
	if (threshold > maxThreshold) setThreshold(maxThreshold);

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
				// The creator's key carries their wallet's account name, so
				// invitations say who sent them (cut to the API's label limit).
				labels: signers.map((s) =>
					s.isCreator
						? creatorName &&
							[...creatorName]
								.slice(0, CONFIG.MAX_KEY_LABEL_LENGTH)
								.join('')
						: s.label.trim() || null,
				),
			},
			invited,
		});

	const goTo = (next: 1 | 2 | 3) => {
		create.reset();
		setFocusId(null);
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

				<WizardStepper step={step} />

				<div className="mt-7 flex flex-col gap-8 @5xl:flex-row @5xl:items-start">
					<div className="@container/card w-full max-w-185 min-w-0 rounded-xl border bg-card @5xl:flex-1">
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
								creatorName={creatorName}
								focusId={focusId}
								onSignersChange={(next) => {
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
								creatorName={creatorName}
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

					<div className="flex w-full max-w-185 flex-col gap-5 @5xl:w-80 @5xl:shrink-0">
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
