// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type * as v1 from '@mysten/sagat/v1';
import { type z } from 'zod';

import {
	type AccountEventRecord,
	type ProposalEvents,
} from '../services/account-events.service';
import { type ProposalProgress } from '../services/proposals.service';

const toV1AccountEvent = (
	event: AccountEventRecord | null,
): z.input<typeof v1.AccountEventSchema> | null =>
	event && {
		id: event.id,
		action: event.action,
		actor: event.actor,
		subject: event.subject,
		// Stored as JSON; the response schema checks it is an object.
		proof: event.proof as v1.AccountEvent['proof'],
		createdAt: event.createdAt.toISOString(),
	};

export const toV1Proposal = ({
	proposal,
	signers,
	sets,
	hasReachedThreshold,
	events,
}: ProposalProgress & { events: ProposalEvents }): z.input<
	typeof v1.ProposalSchema
> => ({
	id: proposal.id,
	digest: proposal.digest,
	accountAddress: proposal.accountAddress,
	accountName: signers.accountName,
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
	hasReachedThreshold,
	signerSets: sets.map((set) => ({
		address: set.signerSet.address,
		threshold: set.signerSet.threshold,
		currentWeight: set.currentWeight,
		hasReachedThreshold: set.hasReachedThreshold,
		members: set.signerSet.members.map((member) => ({
			publicKey: member.publicKey,
			weight: member.weight,
			order: member.order,
		})),
	})),
	events: {
		created: toV1AccountEvent(events.created),
		proposer: toV1AccountEvent(events.proposer),
	},
});
