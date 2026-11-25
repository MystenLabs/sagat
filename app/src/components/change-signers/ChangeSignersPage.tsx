// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import {
	buildSignerChange,
	type Composition,
} from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { useQueryClient } from '@tanstack/react-query';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import {
	Navigate,
	useLocation,
	useNavigate,
	useParams,
} from 'react-router-dom';

import { PreviewCard } from '@/components/create-multisig/SideCards';
import { SkeletonPage } from '@/components/ui/skeleton';
import {
	HelpAccordion,
	type WizardStep,
} from '@/components/wizard/parts';
import { WizardPage } from '@/components/wizard/WizardPage';
import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useAliasProposals } from '@/hooks/useAliasProposals';
import { readNodeFacts } from '@/hooks/useAliasSets';
import {
	createFailedLine,
	useCreateProposal,
} from '@/hooks/useCreateProposal';
import { useDryRun } from '@/hooks/useDryRun';
import { useEpochInfo } from '@/hooks/useEpochInfo';
import { useGetMultisig } from '@/hooks/useGetMultisig';
import { usePublicKeyLookups } from '@/hooks/usePublicKeyLookups';
import { useSignerSetCards } from '@/hooks/useSignerSetCards';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import {
	canChangeSigners,
	changeLabels,
	changeTitle,
	checkChange,
	newComposition,
	newRow,
	rowDifferences,
	startRows,
	type ChangeIntent,
	type ChangeRow,
	type CurrentSet,
} from '@/lib/change-signers';
import { addressInput } from '@/lib/create-multisig';
import { networkLabel } from '@/lib/network';
import { buildFailedLine } from '@/lib/new-proposal';
import { proposalPagePath } from '@/lib/proposalUtils';
import { QueryKeys } from '@/lib/queryKeys';
import { SignersUncheckedError } from '@/lib/signers-refused';
import { toast } from '@/lib/toast';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { SignatureDeclinedError } from '@/lib/wallet-session';

import { ChangesStep } from './ChangesStep';
import { ReviewStep } from './ReviewStep';

const COPY = content.changeSigners;
const NEW_PROPOSAL = content.newProposal;

/** Change signers: its own page, like New proposal; back to Members unless the pod can take a change now. */
export function ChangeSignersPage() {
	const { address } = useParams<{ address: string }>();
	const { network } = useNetwork();
	const { currentAddress } = useApiAuth();
	const {
		data: multisigs,
		isLoading,
		isFetching,
	} = useUserMultisigs();
	const multisig = multisigs?.find(
		(m) => m.address === address && m.isAccepted,
	);
	const { data: details, isError } = useGetMultisig(
		multisig?.address,
	);
	const cards = useSignerSetCards(multisig);
	const aliasProposals = useAliasProposals(address ?? '');
	const loading = (
		<SkeletonPage
			message={content.common.states.loadingPod}
		/>
	);
	if (isLoading || (isFetching && !multisig))
		return loading;
	if (!multisig) return <Navigate to="/" replace />;
	if (
		!isError &&
		(!details || multisig.acting?.state === 'checking')
	)
		return loading;
	const members = `/multisig/${multisig.address}/signers`;
	const main = cards?.[0];
	if (
		!details ||
		!main ||
		!canChangeSigners(
			details.signerChangesEnabled,
			main.set,
			currentAddress?.address,
		) ||
		details.openSignerChange ||
		aliasProposals?.length
	)
		return <Navigate to={members} replace />;
	return (
		<ChangeSignersWizard
			key={`${network}:${multisig.address}`}
			multisig={details}
			current={{
				address: main.address,
				threshold: main.set.threshold,
				members: main.set.members,
			}}
			known={cards.map(({ set }) => ({
				threshold: set.threshold,
				members: [...set.members]
					.sort((a, b) => a.order - b.order)
					.map(({ publicKey, weight }) => ({
						publicKey,
						weight,
					})),
			}))}
			membersPath={members}
		/>
	);
}

/** The change's bytes and the aliases they were built on, or why they couldn't be built. */
interface Built {
	bytes?: string;
	aliases?: string[];
	error?: string;
}

function ChangeSignersWizard({
	multisig,
	current,
	known,
	membersPath,
}: {
	multisig: MultisigWithMembersForPublicKey;
	current: CurrentSet;
	/** The acting sets' compositions, checked by the app. */
	known: Composition[];
	membersPath: string;
}) {
	const navigate = useNavigate();
	const location = useLocation();
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const { network } = useNetwork();
	const { currentAddress } = useApiAuth();
	const { data: epochInfo } = useEpochInfo();
	const create = useCreateProposal();
	const dryRun = useDryRun();

	const [start] = useState(() =>
		startRows(
			current,
			currentAddress?.address,
			location.state as ChangeIntent | null,
		),
	);
	const [rows, setRows] = useState<ChangeRow[]>(start.rows);
	const [focusId, setFocusId] = useState(start.focusId);
	const [threshold, setThreshold] = useState(
		current.threshold,
	);
	const [step, setStep] = useState<WizardStep>(1);
	const [direction, setDirection] = useState<
		'forward' | 'back'
	>('forward');
	const ids = useRef(0);
	const [built, setBuilt] = useState<Built | null>(null);
	const latest = useRef(0);

	// An address pasted into a key field is swapped for its key once found.
	const onKeyFound = useCallback(
		(address: string, publicKey: string) =>
			setRows((prev) =>
				prev.map((row) =>
					addressInput(row.key) === address
						? { ...row, key: publicKey }
						: row,
				),
			),
		[],
	);
	const failedLookups = usePublicKeyLookups(
		rows.flatMap((row) => {
			const address = addressInput(row.key);
			return address && !row.removed ? [address] : [];
		}),
		onKeyFound,
	);
	const check = useMemo(
		() =>
			checkChange({
				current,
				rows,
				threshold,
				lookups: failedLookups,
			}),
		[current, rows, threshold, failedLookups],
	);
	const list = useMemo(
		() => rowDifferences(current, rows, threshold),
		[current, rows, threshold],
	);

	const creating = create.isPending;
	const cancel = () => navigate(membersPath);
	const goTo = (next: WizardStep) => {
		if (creating) return;
		create.reset();
		setFocusId(null);
		setDirection(next > step ? 'forward' : 'back');
		setStep(next);
		window.scrollTo({ top: 0 });
	};

	// Builds the change, then simulates it; only the latest build lands.
	const build = async () => {
		const run = ++latest.current;
		setBuilt(null);
		create.reset();
		dryRun.reset();
		let next: Built;
		const client = dappKit.getClient(network);
		try {
			const node = await readNodeFacts(
				queryClient,
				client,
				network,
				multisig.address,
			);
			if (
				node.aliases.kind !== 'read' ||
				!node.chain ||
				!epochInfo
			)
				throw new SignersUncheckedError(network);
			const tx = new Transaction();
			tx.setSender(multisig.address);
			buildSignerChange(tx, {
				account: multisig.address,
				aliases: node.aliases.aliases,
				oldSet: current.address,
				newSet: newComposition(rows, threshold),
				known,
				chain: node.chain,
				epoch: epochInfo.epoch,
			});
			next = {
				bytes: toBase64(await tx.build({ client })),
				aliases: node.aliases.aliases,
			};
		} catch (error) {
			next = {
				error: await buildFailedLine(
					client,
					multisig.address,
					error,
				),
			};
		}
		if (run !== latest.current) return;
		setBuilt(next);
		if (next.bytes) dryRun.mutate(next.bytes);
	};
	const review = () => {
		goTo(2);
		void build();
	};

	// A new step's heading takes focus, so a screen reader starts there.
	const cardRef = useRef<HTMLDivElement>(null);
	const moved = useRef(false);
	useEffect(() => {
		if (!moved.current) {
			moved.current = true;
			return;
		}
		cardRef.current
			?.querySelector<HTMLElement>('h2')
			?.focus({ preventScroll: true });
	}, [step]);

	const submitting = useRef(false);
	const submit = () => {
		// A declined signature keeps the bytes; the click goes to the wallet again.
		if (
			built?.error ||
			(create.error &&
				!(create.error instanceof SignatureDeclinedError))
		) {
			void build();
			return;
		}
		const newSet = check.signers.address;
		if (
			!built?.bytes ||
			!built.aliases ||
			!newSet ||
			creating ||
			submitting.current
		)
			return;
		submitting.current = true;
		create.mutate(
			{
				multisig,
				transactionData: built.bytes,
				description: changeTitle(list),
				labels: changeLabels({
					current,
					rows,
					aliases: built.aliases,
					newSet,
				}),
			},
			{
				onSuccess: (proposal) => {
					navigate(
						proposalPagePath(
							multisig.address,
							proposal.digest,
						),
						{ replace: true },
					);
					void queryClient.invalidateQueries({
						queryKey: [
							QueryKeys.Multisig,
							multisig.address,
						],
					});
				},
				onError: (error) => {
					if (error instanceof SignatureDeclinedError)
						toast.error(NEW_PROPOSAL.signatureDeclined);
				},
				onSettled: () => {
					submitting.current = false;
				},
			},
		);
	};

	const label = networkLabel(network);
	const name = multisig.name ?? '';

	return (
		<WizardPage
			title={COPY.title}
			breadcrumb={[
				{
					label: content.overview.pages.signers,
					to: membersPath,
				},
				{ label: COPY.title },
			]}
			testId="change-signers"
			steps={COPY.steps}
			step={step}
			reach={check.canReview ? 2 : 1}
			onStep={(next) =>
				next === 2 ? review() : goTo(next)
			}
			busy={creating}
			onCancel={cancel}
			cancelLabel={content.common.actions.discard}
			direction={direction}
			cardRef={cardRef}
			sideKey="preview"
			sideClassName={step === 2 ? 'hidden' : '@4xl:w-80'}
			side={
				<>
					<PreviewCard
						name={name}
						setUp
						signers={check.signers.completeCount}
						incomplete={check.signers.incompleteCount}
						totalWeight={check.signers.totalWeight}
						threshold={threshold}
						address={multisig.address}
						addressMessage={null}
						network={label}
						addressNote={COPY.addressStays}
						thresholdError={!!check.error}
					/>
					<HelpAccordion
						items={COPY.help}
						testId="change-signers-help"
					/>
				</>
			}
		>
			{step === 1 ? (
				<ChangesStep
					current={current}
					rows={rows}
					check={check}
					threshold={threshold}
					focusId={focusId}
					network={label}
					onRowsChange={(next) => {
						setRows(next);
						setFocusId(null);
					}}
					onAddSigner={() => {
						const row = newRow(++ids.current);
						setRows((prev) => [...prev, row]);
						setFocusId(row.id);
					}}
					onThresholdChange={setThreshold}
					onReview={review}
					onCancel={cancel}
				/>
			) : (
				<ReviewStep
					name={name}
					network={label}
					address={multisig.address}
					rows={rows}
					list={list}
					current={current}
					threshold={threshold}
					bytes={built?.bytes ?? null}
					dryRun={dryRun}
					creating={creating}
					awaitingWallet={create.awaitingWallet}
					error={
						createFailedLine(create.error) ??
						built?.error ??
						null
					}
					onRetrySimulation={() =>
						built?.bytes && dryRun.mutate(built.bytes)
					}
					onSubmit={submit}
					onBack={() => goTo(1)}
					onCancel={cancel}
				/>
			)}
		</WizardPage>
	);
}
