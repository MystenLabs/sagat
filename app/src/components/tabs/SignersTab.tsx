// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useOutletContext } from 'react-router-dom';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useGetMultisig } from '@/hooks/useGetMultisig';
import {
	buildMultisigCompositionExport,
	downloadJson,
	getMultisigExportFilename,
} from '@/lib/exportUtils';
import {
	rejectionNotice,
	signerRows,
	signerSetStatus,
} from '@/lib/signers';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { getExplorerUrl } from '@/lib/utils';

import { accountSetup } from '../multisig/account-setup';
import { SetupCard } from '../multisig/SetupCard';
import { SignersCard } from '../multisig/SignersCard';
import { ProposersSection } from '../proposers/ProposersSection';
import { Alert } from '../ui/Alert';

interface SignersTabContext {
	multisig: MultisigWithMembersForPublicKey;
}

/**
 * The signer set and who else may propose. The account list already
 * carries everything shown; the account query on top keeps the proposers
 * and weights fresh after a change on this page.
 */
export function SignersTab() {
	const { multisig } =
		useOutletContext<SignersTabContext>();
	const { currentAddress } = useApiAuth();
	const { network } = useNetwork();
	const { data: details } = useGetMultisig(
		multisig.address,
	);
	const account = details ?? multisig;

	const rows = signerRows(
		account.members,
		currentAddress?.address,
	);
	const notice = rejectionNotice(
		signerSetStatus(account.members, account.threshold),
		rows
			.filter((r) => r.status === 'rejected')
			.map((r) => r.name),
	);
	const setup = accountSetup({
		multisig: account,
		totalWeight:
			details?.totalWeight ?? multisig.totalWeight,
		currentAddress: currentAddress?.address,
	});

	return (
		<div className="@container flex flex-col gap-5">
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
					<SignersCard
						rows={rows}
						threshold={account.threshold}
					/>
					<ProposersSection
						proposers={account.proposers}
						multisigAddress={multisig.address}
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
