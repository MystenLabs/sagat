// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Config } from 'drizzle-kit';

import { databaseUrl } from './database-url';

export default {
	schema: './api/src/db/schema.ts',
	out: './api/src/db/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: databaseUrl(),
	},
} satisfies Config;
