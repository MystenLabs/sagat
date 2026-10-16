// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */

// Applies pending migrations and exits, for deployments that migrate in a
// separate step (a Kubernetes Job or init container) with
// MIGRATE_ON_START=false on the API. Needs only DATABASE_URL.
import { runMigrations } from './migrate';

try {
	await runMigrations();
} catch (error) {
	console.error(error);
	process.exit(1);
}
