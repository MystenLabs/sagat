// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';

import { apiV1Client } from '../lib/api';
import { MutationKeys } from '../lib/queryKeys';
import { writeProposal } from './useGetProposal';

/**
 * Asks the API to check a proposal's digest on chain. Silent: its only
 * caller runs it after a failed execute, which has already told the
 * viewer; the proposal it returns shows the outcome.
 */
export function useVerifyProposal() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [MutationKeys.VerifyProposal],
		mutationFn: (digest: string) =>
			apiV1Client.verifyProposalByDigest(digest),
		onSuccess: (proposal) =>
			writeProposal(queryClient, proposal),
	});
}
