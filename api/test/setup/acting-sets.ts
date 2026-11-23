// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { and, eq } from 'drizzle-orm';

import { db } from '../../src/db';
import {
	SchemaAccountAcceptances,
	SchemaAccountAliases,
	SchemaAccountAliasState,
	SchemaAddresses,
} from '../../src/db/schema';
import { ALIAS_STATE_MAX_AGE_MS } from '../../src/services/aliases.service';
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

// Older than the max age, so the next decision reads the chain.
export const ageAliasState = (
	account: string,
	network: SuiNetwork,
) =>
	db
		.update(SchemaAccountAliasState)
		.set({
			observedAt: new Date(
				Date.now() - ALIAS_STATE_MAX_AGE_MS - 1_000,
			),
		})
		.where(
			and(
				eq(SchemaAccountAliasState.accountAddress, account),
				eq(SchemaAccountAliasState.network, network),
			),
		);

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
