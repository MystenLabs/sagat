// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Writes rows directly, for states the API only reaches with time.
import { E2E } from './env';

// Makes the API's next read of the account's alias set go to the chain.
export const ageAliasState = async (account: string) => {
	// The API's db module reads `DATABASE_URL` when it loads.
	process.env.DATABASE_URL = E2E.databaseUrl;
	const { db } = await import('../../api/src/db');
	await db.$client.query(
		`UPDATE account_alias_state SET observed_at = 'epoch'
		 WHERE account_address = $1 AND network = 'localnet'`,
		[account],
	);
};
