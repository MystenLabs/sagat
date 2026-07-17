// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import app from '../../../api/src/index';

const port = Number(process.env.SAGAT_API_PORT ?? '3000');

Bun.serve({
	hostname: '127.0.0.1',
	port,
	fetch: app.fetch,
});

process.stdout.write(
	`Sagat API listening on http://127.0.0.1:${port}\n`,
);
