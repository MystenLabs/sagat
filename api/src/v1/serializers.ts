// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type v1 } from '@mysten/sagat';
import { type z } from 'zod';

import { type ProposalTally } from '../services/proposals.service';

export const toV1Proposal = ({
	proposal,
	signerSet,
	currentWeight,
	hasReachedThreshold,
}: ProposalTally): z.input<typeof v1.ProposalSchema> => ({
	id: proposal.id,
	digest: proposal.digest,
	accountAddress: proposal.accountAddress,
	accountName: signerSet.name,
	network: proposal.network,
	status: proposal.status,
	transactionBytes: proposal.transactionBytes,
	proposerAddress: proposal.proposerAddress,
	description: proposal.description,
	createdAt: proposal.createdAt.toISOString(),
	signatures: proposal.signatures.map((signature) => ({
		proposalId: signature.proposalId,
		publicKey: signature.publicKey,
		signature: signature.signature,
	})),
	currentWeight,
	hasReachedThreshold,
	signerSet: {
		address: signerSet.address,
		threshold: signerSet.threshold,
		members: signerSet.members.map((member) => ({
			publicKey: member.publicKey,
			weight: member.weight,
			order: member.order,
		})),
	},
});
