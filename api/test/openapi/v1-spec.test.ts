// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Snapshot test for the `/v1` OpenAPI spec.
 *
 * Generates the spec from the mounted app and compares it with
 * `api/openapi/v1.json`. A failure means a `/v1` route, schema or the spec
 * metadata changed: regenerate with `UPDATE_OPENAPI=1 bun test:openapi` and
 * commit the diff with the change, so the API change is reviewed as a spec
 * diff. Needs neither the database nor the Sui network.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { format, resolveConfig } from 'prettier';

import '../setup/no-startup-migrations';

import app from '../../src/index';
import { OPENAPI_PATH } from '../../src/v1/app';

const SNAPSHOT = join(__dirname, '../../openapi/v1.json');

// Formatted with the repository's prettier config, like every other JSON
// file, so `bun fmt:check` passes on the snapshot.
const render = async (document: unknown) =>
	format(JSON.stringify(document), {
		...(await resolveConfig(SNAPSHOT)),
		parser: 'json',
	});

test('the committed /v1 spec matches the mounted app', async () => {
	const response = await app.request(OPENAPI_PATH);
	expect(response.status).toBe(200);
	const actual = await render(await response.json());

	if (process.env.UPDATE_OPENAPI) {
		writeFileSync(SNAPSHOT, actual);
		return;
	}

	expect(actual).toBe(readFileSync(SNAPSHOT, 'utf8'));
});

test('the docs page is served next to the spec', async () => {
	const response = await app.request('/v1/docs');
	expect(response.status).toBe(200);
	expect(response.headers.get('content-type')).toContain(
		'text/html',
	);
	expect(await response.text()).toContain(OPENAPI_PATH);
});
