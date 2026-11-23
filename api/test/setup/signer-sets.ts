// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MultiSigPublicKey } from '@mysten/sui/multisig';

import { db } from '../../src/db';
import {
	SchemaAccountSignerSets,
	SchemaAddresses,
	SchemaSignerSetMembers,
	SchemaSignerSets,
} from '../../src/db/schema';
import { type TestUser } from '../framework/api-test-framework';

// A signer set with no account at its address, as a signer change leaves it,
// linked to `account` when given. `acceptedBy` writes rows a change never would.
export const insertNewSignerSet = async ({
	members,
	threshold,
	account,
	acceptedBy = [],
}: {
	members: TestUser[];
	threshold: number;
	account?: { address: string; draftedBy: TestUser };
	acceptedBy?: TestUser[];
}) => {
	const address = MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: members.map((member) => ({
			publicKey: member.keypair.getPublicKey(),
			weight: 1,
		})),
	}).toSuiAddress();
	await db
		.insert(SchemaAddresses)
		.values(
			members.map((member) => ({
				publicKey: member.publicKey,
				address: member.address,
			})),
		)
		.onConflictDoNothing();
	await db
		.insert(SchemaSignerSets)
		.values({ address, threshold, isVerified: false });
	await db.insert(SchemaSignerSetMembers).values(
		members.map((member, order) => ({
			signerSetAddress: address,
			publicKey: member.publicKey,
			order,
			isAccepted: acceptedBy.includes(member),
		})),
	);
	if (account)
		await db.insert(SchemaAccountSignerSets).values({
			accountAddress: account.address,
			signerSetAddress: address,
			status: 'inviting',
			draftedBy: account.draftedBy.address,
		});
	return address;
};
