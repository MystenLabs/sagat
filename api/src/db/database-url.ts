// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { optionalEnv } from '../utils/env';

// Pool-free, so the migrator and drizzle-kit config can load it.

export const DEFAULT_DATABASE_URL =
	'postgresql://localhost:5432/multisig_db';

/** `DATABASE_URL`, else `DEFAULT_DATABASE_URL`. */
export const databaseUrl = () =>
	optionalEnv('DATABASE_URL') ?? DEFAULT_DATABASE_URL;
