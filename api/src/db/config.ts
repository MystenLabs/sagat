// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Config } from 'drizzle-kit';

export default {
	schema: './api/src/db/schema.ts',
	out: './api/src/db/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url:
			process.env.DATABASE_URL ||
			'postgresql://localhost:5432/multisig_db',
	},
} satisfies Config;
