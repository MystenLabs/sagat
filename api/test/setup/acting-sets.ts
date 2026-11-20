// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { db } from '../../src/db';
import {
	SchemaAccountAcceptances,
	SchemaAccountAliases,
	SchemaAccountAliasState,
	SchemaAddresses,
} from '../../src/db/schema';
import { type SuiNetwork } from '../../src/utils/client';
import { type TestUser } from '../framework/api-test-framework';

// What the refresh would write.
export const setAliases = async (
	account: string,
	network: SuiNetwork,
	aliases: string[],
) => {
	await db
		.insert(SchemaAccountAliasState)
		.values({
			accountAddress: account,
			network,
			exists: true,
			observedVersion: 1,
			observedAt: new Date(),
		})
		.onConflictDoNothing();
	await db.insert(SchemaAccountAliases).values(
		aliases.map((aliasAddress) => ({
			accountAddress: account,
			network,
			aliasAddress,
		})),
	);
};

export const answerFor = (
	account: string,
	user: TestUser,
	answer: 'accepted' | 'rejected',
) =>
	db.insert(SchemaAccountAcceptances).values({
		accountAddress: account,
		publicKey: user.publicKey,
		isAccepted: answer === 'accepted',
		isRejected: answer === 'rejected',
	});

export const register = (user: TestUser) =>
	db
		.insert(SchemaAddresses)
		.values({
			publicKey: user.publicKey,
			address: user.address,
		})
		.onConflictDoNothing();
