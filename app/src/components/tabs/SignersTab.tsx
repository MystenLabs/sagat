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
import { trustsSigners } from '@/lib/proposer-proofs';
import {
	differentSignersLine,
	otherSignerSetRows,
	signerSetCards,
} from '@/lib/signer-sets';
import {
	rejectionNotice,
	signerRows,
	signerSetStatus,
} from '@/lib/signers';
import { sumWeight, thresholdLabel } from '@/lib/threshold';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { getExplorerUrl } from '@/lib/utils';

import { OtherSignerSetsCard } from '../multisig/OtherSignerSetsCard';
import { SetupCard } from '../multisig/SetupCard';
import { SignersCard } from '../multisig/SignersCard';
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
 * The Members page: every signer set that acts on the selected network,
 * the one the viewer signs in first, the original signers when they don't
 * act, who else may propose, and the aliases no set makes up. The account
 * list carries the signers; the account query on top keeps them fresh
 * and is the one that carries the proposers. When it fails, the list's
 * copy stays up under a notice with a way to try again. When its original
 * signers don't make up the opened address, only the reason shows.
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
						fresh: details?.signerSets ?? [],
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

	// Until the node's alias set is read, the set the API says the viewer signs in.
	const viewed = cards?.[0]?.set ?? account;
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
	const original =
		cards && !cards.some((card) => card.isOriginal)
			? account.originalSignerSet
			: null;
	const originalRows =
		original && signerRows(original.members, signerAddress);
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
					{cards && cards.length > 0 ? (
						cards.map((card, i) => {
							const setRows =
								i === 0
									? rows
									: signerRows(
											card.set.members,
											signerAddress,
										);
							return (
								<SignersCard
									key={card.address}
									rows={setRows}
									status={
										i === 0
											? status
											: signerSetStatus(
													setRows,
													card.set.threshold,
												)
									}
									signerSet={card.address}
								>
									{several && (
										<p
											className="text-13 text-muted-foreground"
											data-testid="signer-set-threshold"
										>
											{content.common.threshold(
												thresholdLabel({
													threshold: card.set.threshold,
													totalWeight: sumWeight(
														card.set.members,
													),
												}),
											)}
										</p>
									)}
									{!card.isOriginal && (
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
												<SignerSetAddress
													address={card.address}
												/>
											</div>
											{card.pod && (
												<OpenPodLink
													address={card.pod.address}
													className="-mr-2.5"
												/>
											)}
										</div>
									)}
								</SignersCard>
							);
						})
					) : (
						<SignersCard rows={rows} status={status} />
					)}
					{original && originalRows && (
						<SignersCard
							rows={originalRows}
							status={signerSetStatus(
								originalRows,
								original.threshold,
							)}
							title={content.signers.original.title}
							signerSet={multisig.address}
						>
							<p
								className="text-13 text-foreground-secondary"
								data-testid="original-signers-body"
							>
								{content.signers.original.body(
									networkLabel(network),
								)}
							</p>
						</SignersCard>
					)}
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
									account.originalSignerSet.threshold,
								members: account.originalSignerSet.members,
							}),
						)
					}
					className="w-full shrink-0 @4xl:w-80"
				/>
			</div>
		</div>
	);
}
