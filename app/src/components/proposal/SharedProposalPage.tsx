// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { FileSearch } from 'lucide-react';
import {
	Navigate,
	useSearchParams,
} from 'react-router-dom';

import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useGetProposal } from '@/hooks/useGetProposal';
import { useSessionBoot } from '@/hooks/useSessionBoot';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import { type Labels } from '@/lib/proposal-page';
import { proposalPagePath } from '@/lib/proposalUtils';

import { ProposalLoadError } from './ProposalPage';
import { ProposalPageSkeleton } from './ProposalPageSkeleton';
import { ProposalView } from './ProposalView';

// The public response carries no key labels, so signers go by address.
const NO_LABELS: Labels = new Map();

/**
 * A shared link, `/proposals?digest=…`, open to anyone. A signed-in
 * viewer whose account it is moves to the proposal's page under the
 * account; everyone else reads it here, outside the account.
 */
export function SharedProposalPage() {
	const [searchParams] = useSearchParams();
	const digest = searchParams.get('digest');
	const { reconnecting, checkingAuth } = useSessionBoot();
	const { isCurrentAddressAuthenticated } = useApiAuth();
	const { data: multisigs, isLoading: loadingAccounts } =
		useUserMultisigs();
	const proposalQuery = useGetProposal(digest);
	const proposal = proposalQuery.data;

	if (!digest) {
		return (
			<div className="page-shell">
				<PageHeader
					title={content.proposal.shared.heading}
				/>
				<EmptyState
					icon={FileSearch}
					title={content.proposal.load.missingDigestTitle}
					description={
						content.proposal.load.missingDigestDescription
					}
				/>
			</div>
		);
	}

	// Hold until it's known whether the viewer's accounts include it.
	if (
		proposalQuery.isLoading ||
		reconnecting ||
		checkingAuth ||
		(isCurrentAddressAuthenticated && loadingAccounts)
	)
		return <ProposalPageSkeleton />;

	if (!proposal)
		return (
			<ProposalLoadError error={proposalQuery.error} />
		);

	const own = multisigs?.find(
		(m) =>
			m.address === proposal.multisigAddress &&
			m.isAccepted,
	);
	if (own)
		return (
			<Navigate
				to={proposalPagePath(own.address, proposal.digest)}
				replace
			/>
		);

	// Keyed, so per-proposal state (the execute settling flag, the
	// checkbox, dialogs) doesn't carry over to another proposal.
	return (
		<ProposalView
			key={proposal.digest}
			proposal={proposal}
			labels={NO_LABELS}
			proposalsPath={null}
			canCancel={false}
		/>
	);
}
