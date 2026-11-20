// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useOutletContext } from 'react-router-dom';

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useGetMultisig } from '@/hooks/useGetMultisig';
import { accountSetup } from '@/lib/account-setup';
import {
	buildMultisigCompositionExport,
	downloadJson,
	getMultisigExportFilename,
} from '@/lib/exportUtils';
import { trustsSigners } from '@/lib/proposer-proofs';
import {
	rejectionNotice,
	signerRows,
	signerSetStatus,
} from '@/lib/signers';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { getExplorerUrl } from '@/lib/utils';

import { SetupCard } from '../multisig/SetupCard';
import { SignersCard } from '../multisig/SignersCard';
import { SignersRefused } from '../multisig/SignersRefused';
import { ProposersSection } from '../proposers/ProposersSection';
import { Alert } from '../ui/Alert';
import { InlineRetry } from '../ui/inline-retry';

interface SignersTabContext {
	multisig: MultisigWithMembersForPublicKey;
}

/**
 * The Members page: the signer set and who else may propose. The account
 * list already carries everything shown; the account query on top keeps
 * the proposers and weights fresh after a change on this page. When it
 * fails, the list's copy stays up under a notice with a way to try again.
 * When its signers don't make up the opened address, only the reason shows.
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
	const account = details ?? multisig;

	if (details && !trustsSigners(details, multisig.address))
		return (
			<SignersRefused
				rule="signers"
				testId="signers-refused"
			/>
		);

	const rows = signerRows(
		account.members,
		currentAddress?.address,
	);
	const status = signerSetStatus(rows, account.threshold);
	const notice = rejectionNotice(status);
	const setup = accountSetup({
		multisig: account,
		currentAddress: currentAddress?.address,
	});

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
			{/* The setup card sits beside the lists from 896px of content,
			    under them before that. */}
			<div className="flex flex-col gap-5 @4xl:flex-row @4xl:items-start @4xl:gap-7">
				<div className="flex min-w-0 flex-1 flex-col gap-5">
					<SignersCard rows={rows} status={status} />
					<ProposersSection
						multisig={account}
						currentAddress={currentAddress?.address}
						// Only the account's own response has proposer events.
						checkProofs={details !== undefined}
						openedAddress={multisig.address}
					/>
				</div>
				<SetupCard
					setup={setup}
					explorerUrl={getExplorerUrl(
						multisig.address,
						network,
						'account',
					)}
					onDownload={() =>
						downloadJson(
							getMultisigExportFilename(multisig.address),
							buildMultisigCompositionExport(account),
						)
					}
					className="w-full shrink-0 @4xl:w-80"
				/>
			</div>
		</div>
	);
}
