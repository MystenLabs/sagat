// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type * as v1 from '@mysten/sagat/v1';
import { type z } from 'zod';

import { ProposalStatus } from '../db/schema';
import { type KeyLabels } from '../loaders/account-keys.loader';
import {
	type AccountEventRecord,
	type ProposerWithLatestEvent,
} from '../services/account-events.service';
import {
	type CheckedAccount,
	type RemovedAccount,
} from '../services/accounts.service';
import {
	aliasCallsOf,
	type CheckedProposal,
} from '../services/proposals.service';
import {
	memberAnswer,
	type ActingMember,
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

const toV1SetMember = (member: {
	publicKey: string;
	weight: number;
	order: number;
}): z.input<typeof v1.SignerSetMemberSchema> => ({
	publicKey: member.publicKey,
	weight: member.weight,
	order: member.order,
});

const toV1SignerChange = (
	{ change }: NonNullable<CheckedProposal['signerChange']>,
	labels: KeyLabels,
): z.input<typeof v1.ProposalSignerChangeSchema> => {
	const adds =
		change?.after.find((a) => !change.before.includes(a)) ??
		null;
	const old = new Set(
		change?.oldSet.members.map((m) => m.publicKey),
	);
	return {
		removes: change?.oldSet.address ?? null,
		adds,
		labels: (
			change?.newSets.find((set) => set.address === adds)
				?.members ?? []
		).flatMap(({ publicKey }) => {
			const label = labels.get(publicKey);
			return label && !old.has(publicKey)
				? [{ publicKey, label }]
				: [];
		}),
	};
};

export const toV1Proposal = (
	{
		proposal,
		signers,
		sets,
		hasReachedThreshold,
		events,
		signerSetsStale,
		signerChange,
	}: CheckedProposal,
	labels: KeyLabels,
): z.input<typeof v1.ProposalSchema> => ({
	digest: proposal.digest,
	accountAddress: proposal.accountAddress,
	accountName: signers.accountName,
	network: proposal.network,
	kind: signerChange
		? 'signer_change'
		: aliasCallsOf(proposal.transactionBytes).length > 0
			? 'alias_call'
			: 'transaction',
	status: ProposalStatus[
		proposal.status
	] as v1.ProposalStatusName,
	ready: hasReachedThreshold,
	transactionBytes: proposal.transactionBytes,
	proposerAddress: proposal.proposerAddress,
	description: proposal.description,
	createdAt: proposal.createdAt.toISOString(),
	signatures: proposal.signatures.map((signature) => ({
		publicKey: signature.publicKey,
		signature: signature.signature,
	})),
	signerSets: [
		...sets.map((set) => ({
			address: set.signerSet.address,
			threshold: set.signerSet.threshold,
			currentWeight: set.currentWeight,
			members: set.signerSet.members.map(toV1SetMember),
			acting: true,
			original:
				set.signerSet.address ===
				signers.originalSet?.address,
		})),
		// Listed so the account's address can be rebuilt; counts nothing.
		...(signers.originalSet &&
		!sets.some(
			(set) =>
				set.signerSet.address ===
				signers.originalSet?.address,
		)
			? [
					{
						address: signers.originalSet.address,
						threshold: signers.originalSet.threshold,
						currentWeight: 0,
						members:
							signers.originalSet.members.map(
								toV1SetMember,
							),
						acting: false,
						original: true,
					},
				]
			: []),
	],
	signerChange:
		signerChange && toV1SignerChange(signerChange, labels),
	events: {
		created: toV1AccountEvent(events.created),
		proposer: toV1AccountEvent(events.proposer),
		cancelled: toV1AccountEvent(events.cancelled),
	},
	executedVia: proposal.executedVia,
	signerSetsStale,
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
	signerSetsStale,
}: Pick<
	CheckedAccount,
	| 'signerSet'
	| 'labels'
	| 'origin'
	| 'signers'
	| 'signerSetsStale'
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
	signerSetsStale,
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
	removed: RemovedAccount,
): z.input<typeof v1.RemovedAccountSchema> => ({
	address: removed.accountAddress,
	name: removed.accountName,
	publicKey: removed.publicKey,
	signerSetAddress: removed.signerSetAddress,
	eventId: removed.eventId,
	removedAt: removed.removedAt.toISOString(),
	transactionDigest: removed.transactionDigest,
});
