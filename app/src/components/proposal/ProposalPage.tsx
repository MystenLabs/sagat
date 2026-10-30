// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	SagatApiError,
	type PublicProposal,
} from '@mysten/sagat';
import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useGetProposal } from '@/hooks/useGetProposal';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import {
	proposalPagePath,
	proposalsPath,
	sharedProposalPath,
} from '@/lib/proposalUtils';
import { memberLabels } from '@/lib/signers';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { ProposalPageSkeleton } from './ProposalPageSkeleton';
import { ProposalView } from './ProposalView';

/**
 * A proposal's page under its account. Waits for the account list like
 * the account pages and, when the account isn't one of the viewer's
 * accepted accounts, moves to the proposal's shared page. A proposal of
 * another of their accounts moves to that account's page.
 */
export function ProposalPage() {
	const { address, digest } = useParams<{
		address: string;
		digest: string;
	}>();
	const {
		data: multisigs,
		isLoading,
		isFetching,
	} = useUserMultisigs();
	const proposalQuery = useGetProposal(digest ?? null);
	const multisig = multisigs?.find(
		(m) => m.address === address && m.isAccepted,
	);

	// Also wait while the list refreshes without this account (just
	// joined), rather than redirecting on the stale list.
	if (isLoading || (isFetching && !multisig))
		return <ProposalPageSkeleton />;
	if (!multisig)
		return (
			<Navigate
				to={digest ? sharedProposalPath(digest) : '/'}
				replace
			/>
		);
	if (proposalQuery.isLoading)
		return <ProposalPageSkeleton />;

	const proposal = proposalQuery.data;
	if (!proposal || !digest)
		return (
			<ProposalLoadError
				error={proposalQuery.error}
				proposalsPath={proposalsPath(multisig.address)}
			/>
		);

	if (proposal.multisigAddress !== multisig.address) {
		const own = multisigs?.find(
			(m) =>
				m.address === proposal.multisigAddress &&
				m.isAccepted,
		);
		return own ? (
			<Navigate
				to={proposalPagePath(own.address, digest)}
				replace
			/>
		) : (
			<ProposalLoadError
				proposalsPath={proposalsPath(multisig.address)}
			/>
		);
	}

	return (
		<AccountProposal
			multisig={multisig}
			proposal={proposal}
		/>
	);
}

function AccountProposal({
	multisig,
	proposal,
}: {
	multisig: MultisigWithMembersForPublicKey;
	proposal: PublicProposal;
}) {
	// Signers go by their keys' labels, which only the account has.
	const labels = useMemo(
		() => memberLabels(multisig.members),
		[multisig.members],
	);
	// Keyed, so per-proposal state (the execute settling flag, the
	// checkbox, dialogs) doesn't carry over to another proposal.
	return (
		<ProposalView
			key={proposal.digest}
			proposal={proposal}
			labels={labels}
			proposalsPath={proposalsPath(multisig.address)}
			canCancel
		/>
	);
}

/**
 * The digest is unknown, or the proposal couldn't be loaded. An unknown
 * digest reads the same everywhere; `proposalsPath` links back under the
 * account.
 */
export function ProposalLoadError({
	error,
	proposalsPath,
}: {
	error?: unknown;
	proposalsPath?: string;
}) {
	const notFound =
		error instanceof SagatApiError && error.status === 404;
	return (
		<div className="page-shell">
			<PageHeader
				title="Proposal"
				backLink={proposalsPath}
				backLabel="Proposals"
			/>
			<ErrorState
				title="Failed to load proposal"
				error={notFound ? undefined : error}
				fallback="This proposal doesn't exist."
				hint="Check that the link is correct."
				testId="proposal-detail-error"
			/>
		</div>
	);
}
