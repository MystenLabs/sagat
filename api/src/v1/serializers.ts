// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Maps what the services return to the `/v1` response shapes in
 * `./schemas`. Each function builds its object field by field, so a new
 * column never reaches a response by accident.
 */

import { type SignerSetMember } from '../db/schema';
import { type KeyLabels } from '../loaders/account-keys.loader';
import {
	type AccountWithSignerSets,
	type LinkedSignerSet,
} from '../services/accounts.service';

export const toSignerSetMember = (
	member: SignerSetMember,
	labels: KeyLabels,
) => ({
	signerSetAddress: member.signerSetAddress,
	publicKey: member.publicKey,
	weight: member.weight,
	order: member.order,
	isAccepted: member.isAccepted,
	isRejected: member.isRejected,
	label: labels.get(member.publicKey) ?? null,
});

export const toSignerSetWithMembers = ({
	link,
	signerSet,
	labels,
}: LinkedSignerSet) => ({
	address: signerSet.address,
	label: link.label,
	status: link.status,
	isVerified: signerSet.isVerified,
	threshold: signerSet.threshold,
	totalWeight: signerSet.totalWeight,
	draftedBy: link.draftedBy,
	createdAt: link.createdAt,
	members: signerSet.members.map((member) =>
		toSignerSetMember(member, labels),
	),
});

export const toAccount = ({
	account,
	proposers,
	signerSets,
}: AccountWithSignerSets) => ({
	address: account.address,
	name: account.name,
	createdAt: account.createdAt,
	proposers: proposers.map((proposer) => ({
		accountAddress: account.address,
		address: proposer.address,
		addedBy: proposer.addedBy,
		addedAt: proposer.addedAt,
	})),
	signerSets: signerSets.map(toSignerSetWithMembers),
});
