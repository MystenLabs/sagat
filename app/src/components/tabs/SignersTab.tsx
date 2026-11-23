// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useGetMultisig } from '@/hooks/useGetMultisig';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import { accountSetup } from '@/lib/account-setup';
import {
	buildMultisigCompositionExport,
	downloadJson,
	getMultisigExportFilename,
} from '@/lib/exportUtils';
import { networkLabel } from '@/lib/network';
import {
	originalSignerSet,
	shownActingSets,
} from '@/lib/proposal-integrity';
import { approvalsThresholdLabel } from '@/lib/proposal-page';
import { trustsSigners } from '@/lib/proposer-proofs';
import {
	differentSignersLine,
	otherSignerSetRows,
	signerSetCards,
	type SignerSetCard,
} from '@/lib/signer-sets';
import {
	rejectionNotice,
	signerRows,
	signerSetStatus,
} from '@/lib/signers';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { getExplorerUrl } from '@/lib/utils';

import { FoldedRow } from '../multisig/FoldedRow';
import { OtherSignerSetsCard } from '../multisig/OtherSignerSetsCard';
import { SetupCard } from '../multisig/SetupCard';
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
import { InlineRetry } from '../ui/inline-retry';

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

	const cards = useMemo(
		() =>
			acting
				? signerSetCards({
						acting: acting.signerSets,
						fresh: details ? shownActingSets(details) : [],
						account: multisig.address,
						pods: pods ?? [],
						signerAddress,
					})
				: null,
		[
			acting,
			details,
			multisig.address,
			pods,
			signerAddress,
		],
	);
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
	const differentOn = differentSignersLine(
		details?.networksWithDifferentSigners ?? [],
	);

	return (
		<div className="@container flex flex-col gap-5">
			{isError && (
				<Alert variant="error" data-testid="signers-error">
					{content.signers.loadError}{' '}
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
					{content.signers.severalSignerSets(
						cards?.length ?? 0,
						networkLabel(network),
					)}
				</Alert>
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
						folded={
							<>
								{others.length > 0 && (
									<FoldedRow
										label={content.signers.moreSignerSets(
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
										label={content.signers.original.title}
										count={originalRows.length}
										testId="original-signers"
									>
										<p
											className="text-13 text-foreground-secondary"
											data-testid="original-signers-body"
										>
											{content.signers.original.body(
												networkLabel(network),
											)}
										</p>
										<SignersTable rows={originalRows} />
									</FoldedRow>
								)}
							</>
						}
					>
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
					className="w-full shrink-0 @4xl:w-80"
				/>
			</div>
		</div>
	);
}

/** "Threshold 2 of 3", for a page that shows several sets. */
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

/** An added set's address whole with copy, under the viewer's pod name and "Open pod" when it is one of theirs. */
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
