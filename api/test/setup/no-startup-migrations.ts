// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Imported before the app: each test file migrates its own database, so the
// app must not migrate `DATABASE_URL` when it loads.
process.env.MIGRATE_ON_START = 'false';
