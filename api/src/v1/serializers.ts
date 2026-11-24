// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type * as v1 from '@mysten/sagat/v1';
import { type z } from 'zod';

import { type KeyLabels } from '../loaders/account-keys.loader';
import {
	type AccountEventRecord,
	type ProposalEvents,
	type ProposerWithLatestEvent,
} from '../services/account-events.service';
import { type CheckedAccount } from '../services/accounts.service';
import { type ProposalProgress } from '../services/proposals.service';
import {
	memberAnswer,
	type ActingMember,
	type RemovedFromAccount,
} from '../services/signers.service';

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

const toV1Member = (
	member: Omit<ActingMember, 'answer'>,
	answer: ActingMember['answer'],
	labels: KeyLabels,
): z.input<typeof v1.AccountMemberSchema> => ({
	publicKey: member.publicKey,
	weight: member.weight,
	order: member.order,
	answer,
	label: labels.get(member.publicKey) ?? null,
});

export const toV1Account = ({
	signerSet,
	labels,
	origin,
	signers,
	signersChecked,
}: Pick<
	CheckedAccount,
	| 'signerSet'
	| 'labels'
	| 'origin'
	| 'signers'
	| 'signersChecked'
>): z.input<typeof v1.AccountSchema> => ({
	address: signerSet.address,
	name: signers.accountName,
	createdBy: origin.draftedBy,
	createdAt: origin.createdAt.toISOString(),
	signerSets: [
		{
			kind: 'signer_set',
			address: signerSet.address,
			threshold: signerSet.threshold,
			members: signerSet.members.map((member) =>
				toV1Member(member, memberAnswer(member), labels),
			),
			acting: signers.actingSets.some(
				(set) => set.address === signerSet.address,
			),
			original: true,
		},
		...signers.actingSets
			.filter((set) => set.address !== signerSet.address)
			.map((set) => ({
				...set,
				members: set.members.map((member) =>
					toV1Member(member, member.answer, labels),
				),
				acting: true,
				original: false,
			})),
		...signers.otherSignerSets.map((address) => ({
			kind: 'unknown' as const,
			address,
		})),
	],
	signersChecked,
});

export const toV1AccountProposer = (
	proposer: ProposerWithLatestEvent,
): z.input<typeof v1.AccountProposerSchema> => ({
	address: proposer.address,
	addedBy: proposer.addedBy,
	addedAt: proposer.addedAt.toISOString(),
	event: toV1AccountEvent(proposer.event),
});

export const toV1RemovedAccount = (
	removed: RemovedFromAccount,
): z.input<typeof v1.RemovedAccountSchema> => ({
	address: removed.accountAddress,
	name: removed.accountName,
	publicKey: removed.publicKey,
	signerSetAddress: removed.signerSetAddress,
	eventId: removed.eventId,
	removedAt: removed.removedAt.toISOString(),
});
