// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { buildEnable } from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
	Link,
	useNavigate,
	useOutletContext,
} from 'react-router-dom';

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useAliasProposals } from '@/hooks/useAliasProposals';
import {
	createFailedLine,
	useCreateProposal,
} from '@/hooks/useCreateProposal';
import { useGetMultisig } from '@/hooks/useGetMultisig';
import { useSignerSetCards } from '@/hooks/useSignerSetCards';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import { accountSetup } from '@/lib/account-setup';
import {
	changeSignersPath,
	type ChangeIntent,
} from '@/lib/change-signers';
import {
	buildMultisigCompositionExport,
	downloadJson,
	getMultisigExportFilename,
} from '@/lib/exportUtils';
import { networkLabel } from '@/lib/network';
import { originalSignerSet } from '@/lib/proposal-integrity';
import {
	enablesSignerChanges,
	proposalPagePath,
} from '@/lib/proposalUtils';
import { trustsSigners } from '@/lib/proposer-proofs';
import {
	differentSignersLine,
	otherSignerSetRows,
	type SignerSetCard,
} from '@/lib/signer-sets';
import {
	rejectionNotice,
	signerRows,
	signerSetStatus,
} from '@/lib/signers';
import { approvalsThresholdLabel } from '@/lib/threshold';
import { toast } from '@/lib/toast';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import {
	cn,
	errorMessage,
	getExplorerUrl,
} from '@/lib/utils';

import { FoldedRow } from '../multisig/FoldedRow';
import { OtherSignerSetsCard } from '../multisig/OtherSignerSetsCard';
import { SetupCard } from '../multisig/SetupCard';
import { SignerRowMenu } from '../multisig/SignerRowMenu';
import {
	SignersCard,
	SignersTable,
} from '../multisig/SignersCard';
import {
	OpenPodLink,
	SignerSetAddress,
} from '../multisig/SignerSetAddress';
import { SignersRefused } from '../multisig/SignersRefused';
import { ProposersSection } from '../proposers/ProposersSection';
import { Alert } from '../ui/Alert';
import {
	Button,
	buttonVariants,
	disabledButton,
} from '../ui/button';
import { InlineRetry } from '../ui/inline-retry';

const COPY = content.signers;
const COMMON = content.common;
const NEW_PROPOSAL = content.newProposal;

interface SignersTabContext {
	multisig: MultisigWithMembersForPublicKey;
}

/**
 * The Members page: the Signers card of the set the viewer signs in, the
 * other acting sets and the original signers folded under it; the
 * proposers; the aliases no set makes up. The list's copy stands in until
 * the account query answers, and under a notice when it fails.
 */
export function SignersTab() {
	const { multisig } =
		useOutletContext<SignersTabContext>();
	const { currentAddress } = useApiAuth();
	const { network } = useNetwork();
	const {
		data: details,
		isError,
		isFetching,
		refetch,
	} = useGetMultisig(multisig.address);
	const { data: pods } = useUserMultisigs();
	const account = details ?? multisig;
	const signerAddress = currentAddress?.address;
	const acting =
		multisig.acting?.state === 'ok'
			? multisig.acting
			: null;

	const cards = useSignerSetCards(multisig);
	const otherSets = useMemo(
		() =>
			acting
				? otherSignerSetRows(
						acting.unidentified,
						pods ?? [],
					)
				: [],
		[acting, pods],
	);

	const navigate = useNavigate();
	const dappKit = useDAppKit();
	const create = useCreateProposal();
	const [building, setBuilding] = useState(false);
	// Undefined until the list loads; the API takes one alias proposal at a time.
	const aliasProposals = useAliasProposals(
		multisig.address,
	);
	const enableProposal = aliasProposals?.find((proposal) =>
		enablesSignerChanges(proposal.transactionBytes),
	);
	const changesEnabled =
		details?.signerChangesEnabled ?? true;
	const changePending =
		!!details?.openSignerChange || !!aliasProposals?.length;
	const openChange = (intent: ChangeIntent | null = null) =>
		navigate(changeSignersPath(multisig.address), {
			state: intent,
		});

	const enableSignerChanges = async () => {
		if (!details) return;
		setBuilding(true);
		let bytes: string;
		try {
			const tx = new Transaction();
			tx.setSender(multisig.address);
			buildEnable(tx);
			bytes = toBase64(
				await tx.build({
					client: dappKit.getClient(network),
				}),
			);
		} catch (error) {
			toast.error(
				errorMessage(error, NEW_PROPOSAL.createFailed),
			);
			return;
		} finally {
			setBuilding(false);
		}
		create.mutate(
			{
				multisig: details,
				transactionData: bytes,
				description: COPY.enableSignerChanges,
			},
			{
				onSuccess: (proposal) =>
					navigate(
						proposalPagePath(
							multisig.address,
							proposal.digest,
						),
					),
				onError: (error) =>
					toast.error(
						createFailedLine(error) ??
							NEW_PROPOSAL.signatureDeclined,
					),
			},
		);
	};

	if (details && !trustsSigners(details, multisig.address))
		return (
			<SignersRefused
				rule="signers"
				testId="signers-refused"
			/>
		);

	// Until the node's alias set is read, the original set.
	const [main, ...others] = cards ?? [];
	const viewed = main?.set ?? account;
	const rows = signerRows(viewed.members, signerAddress);
	const status = signerSetStatus(rows, viewed.threshold);
	const notice = rejectionNotice(status);
	const setup = accountSetup({
		multisig: {
			...account,
			threshold: viewed.threshold,
			members: viewed.members,
		},
		currentAddress: signerAddress,
	});
	const originalRows =
		cards && !cards.some((card) => card.isOriginal)
			? signerRows(
					originalSignerSet(account).members,
					signerAddress,
				)
			: null;
	const several = (cards?.length ?? 0) > 1;
	const offerChanges =
		!!main &&
		rows.some((row) => row.isYou) &&
		details?.signerChangesEnabled === true;
	const differentOn = differentSignersLine(
		details?.networksWithDifferentSigners ?? [],
	);

	return (
		<div className="@container flex flex-col gap-5">
			{isError && (
				<Alert variant="error" data-testid="signers-error">
					{COPY.loadError}{' '}
					<InlineRetry
						onRetry={() => void refetch()}
						retrying={isFetching}
						testId="signers-retry"
					/>
				</Alert>
			)}
			{notice && (
				<Alert
					variant={notice.tone}
					data-testid="signers-notice"
					data-tone={notice.tone}
				>
					{notice.message}
				</Alert>
			)}
			{several && (
				<Alert
					variant="warning"
					data-testid="several-signer-sets"
				>
					{COMMON.severalSignerSets(
						cards?.length ?? 0,
						networkLabel(network),
					)}
				</Alert>
			)}
			{!changesEnabled && enableProposal && (
				<ProposalBanner
					variant="info"
					to={proposalPagePath(
						multisig.address,
						enableProposal.digest,
					)}
					testId="enable-signer-changes-pending"
					linkTestId="enable-signer-changes-proposal"
				>
					{COPY.enableSignerChangesPending(
						networkLabel(network),
					)}
				</ProposalBanner>
			)}
			{details?.openSignerChange && (
				<ProposalBanner
					variant="warning"
					to={proposalPagePath(
						multisig.address,
						details.openSignerChange.digest,
					)}
					testId="signer-change-pending"
					linkTestId="signer-change-proposal"
				>
					{COPY.changePending}
				</ProposalBanner>
			)}
			{differentOn && (
				<Alert variant="info" data-testid="signers-differ">
					{differentOn}
				</Alert>
			)}
			{/* The setup card sits beside the lists from 896px of content,
			    under them before that. */}
			<div className="flex flex-col gap-5 @4xl:flex-row @4xl:items-start @4xl:gap-7">
				<div className="flex min-w-0 flex-1 flex-col gap-5">
					<SignersCard
						rows={rows}
						status={status}
						signerSet={main?.address}
						action={
							offerChanges && (
								<Button
									variant="outline"
									size="sm"
									disabled={changePending}
									onClick={() =>
										openChange({ kind: 'add' })
									}
									className={cn(
										'disabled:border-transparent',
										disabledButton,
									)}
									data-testid="signers-add-signer"
								>
									<Plus />
									{content.common.actions.addSigner}
								</Button>
							)
						}
						menu={
							offerChanges
								? (row) => (
										<SignerRowMenu
											disabled={changePending}
											isYou={row.isYou}
											removeBlocked={
												row.isYou
													? COPY.cantRemoveYourself
													: rows.length <= 2
														? COPY.needsTwoSigners
														: null
											}
											onReplace={() =>
												openChange({
													kind: 'replace',
													publicKey: row.member.publicKey,
												})
											}
											onChangeWeight={() => openChange()}
											onRemove={() =>
												openChange({
													kind: 'remove',
													publicKey: row.member.publicKey,
												})
											}
										/>
									)
								: undefined
						}
						folded={
							<>
								{others.length > 0 && (
									<FoldedRow
										label={COMMON.moreSignerSets(
											others.length,
										)}
										testId="other-acting-sets"
									>
										{others.map((card) => (
											<div
												key={card.address}
												className="flex flex-col gap-3"
												data-testid="folded-signer-set"
												data-signer-set={card.address}
											>
												<SignerSetLabel card={card} />
												<SetThreshold set={card.set} />
												<SignersTable
													rows={signerRows(
														card.set.members,
														signerAddress,
													)}
												/>
											</div>
										))}
									</FoldedRow>
								)}
								{originalRows && (
									<FoldedRow
										label={COMMON.originalSigners.title}
										count={originalRows.length}
										testId="original-signers"
									>
										<p
											className="text-13 text-foreground-secondary"
											data-testid="original-signers-body"
										>
											{COPY.original.body(
												networkLabel(network),
											)}
										</p>
										<SignersTable rows={originalRows} />
									</FoldedRow>
								)}
							</>
						}
					>
						{acting &&
							!changesEnabled &&
							aliasProposals?.length === 0 && (
								<Alert
									variant="info"
									data-testid="signer-changes-not-enabled"
								>
									<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
										<span>
											{COPY.signerChangesNotEnabled(
												networkLabel(network),
											)}
										</span>
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												void enableSignerChanges()
											}
											disabled={
												building || create.isPending
											}
											data-testid="enable-signer-changes"
										>
											{COPY.enableSignerChanges}
										</Button>
									</div>
								</Alert>
							)}
						{several && main && (
							<SetThreshold set={main.set} />
						)}
						{main && !main.isOriginal && (
							<SignerSetLabel card={main} />
						)}
					</SignersCard>
					{details && (
						<ProposersSection
							multisig={details}
							currentAddress={signerAddress}
							openedAddress={multisig.address}
						/>
					)}
					{otherSets.length > 0 && (
						<OtherSignerSetsCard
							rows={otherSets}
							network={networkLabel(network)}
						/>
					)}
				</div>
				<SetupCard
					setup={setup}
					network={networkLabel(network)}
					explorerUrl={getExplorerUrl(
						multisig.address,
						network,
						'account',
					)}
					onDownload={() =>
						downloadJson(
							getMultisigExportFilename(multisig.address),
							buildMultisigCompositionExport({
								address: account.address,
								name: account.name,
								threshold:
									originalSignerSet(account).threshold,
								members: originalSignerSet(account).members,
							}),
						)
					}
					onChangeThreshold={
						offerChanges ? () => openChange() : undefined
					}
					changePending={changePending}
					className="w-full shrink-0 @4xl:w-80"
				/>
			</div>
		</div>
	);
}

function ProposalBanner({
	variant,
	to,
	testId,
	linkTestId,
	children,
}: {
	variant: 'info' | 'warning';
	to: string;
	testId: string;
	linkTestId: string;
	children: string;
}) {
	return (
		<Alert variant={variant} data-testid={testId}>
			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
				<span>{children}</span>
				<Link
					to={to}
					className={cn(
						buttonVariants({
							variant: 'link',
							size: 'xs',
						}),
						'h-auto px-0 text-13 text-inherit hover:no-underline',
					)}
					data-testid={linkTestId}
				>
					{content.common.actions.viewProposal}
				</Link>
			</div>
		</Alert>
	);
}

function SetThreshold({ set }: Pick<SignerSetCard, 'set'>) {
	return (
		<p
			className="text-13 text-muted-foreground"
			data-testid="signer-set-threshold"
		>
			{approvalsThresholdLabel(set)}
		</p>
	);
}

function SignerSetLabel({ card }: { card: SignerSetCard }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
			<div className="flex min-w-0 flex-col gap-0.5">
				{card.pod?.name && (
					<span
						className="text-13 font-medium"
						data-testid="signer-set-pod-name"
					>
						{card.pod.name}
					</span>
				)}
				<SignerSetAddress address={card.address} />
			</div>
			{card.pod && (
				<OpenPodLink address={card.pod.address} />
			)}
		</div>
	);
}
