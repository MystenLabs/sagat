// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { format, resolveConfig } from 'prettier';

import { getV1OpenAPIDocument } from '../../src/v1';

const SNAPSHOT = join(__dirname, '../../openapi/v1.json');

// Formatted with the repository's prettier config, so `fmt:check` passes.
const render = async (document: unknown) =>
	format(JSON.stringify(document), {
		...(await resolveConfig(SNAPSHOT)),
		parser: 'json',
	});

test('the committed /v1 spec matches the routes', async () => {
	const actual = await render(getV1OpenAPIDocument());

	if (process.env.UPDATE_OPENAPI) {
		writeFileSync(SNAPSHOT, actual);
		return;
	}

	expect(actual).toBe(readFileSync(SNAPSHOT, 'utf8'));
});
