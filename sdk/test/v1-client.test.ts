// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'bun:test';

import {
	ProposalStatus,
	SagatApiError,
	SagatResponseError,
	SagatV1Client,
	type Fetch,
} from '../src/index.js';

const ADDRESS = `0x${'ab'.repeat(32)}`;
const DIGEST =
	'7mCUQnG1QYr3kV6gNNSeRgG9YZbhYk3mt3Grqbv1aR3S';

const proposal = {
	id: 1,
	digest: DIGEST,
	accountAddress: ADDRESS,
	accountName: 'Treasury',
	network: 'testnet',
	status: ProposalStatus.PENDING,
	transactionBytes: 'AAAA',
	proposerAddress: ADDRESS,
	description: null,
	createdAt: '2026-11-18T10:00:00.000Z',
	signatures: [
		{ proposalId: 1, publicKey: 'pk', signature: 'sig' },
	],
	currentWeight: 1,
	hasReachedThreshold: false,
	signerSet: {
		address: ADDRESS,
		threshold: 2,
		members: [{ publicKey: 'pk', weight: 1, order: 0 }],
	},
};

const replying =
	(status: number, body: unknown): Fetch =>
	async () =>
		Response.json(body, { status });

describe('SagatV1Client', () => {
	test('returns the parsed proposal, without unknown keys', async () => {
		const client = new SagatV1Client('', {
			fetch: replying(200, { ...proposal, events: {} }),
		});

		expect(await client.getProposal(DIGEST)).toEqual(
			proposal,
		);
	});

	test('rejects a 2xx body that does not match the schema', async () => {
		const client = new SagatV1Client('', {
			fetch: replying(200, {
				...proposal,
				accountAddress: 'not-an-address',
			}),
		});

		const error = await client
			.getProposal(DIGEST)
			.catch((e) => e);
		expect(error).toBeInstanceOf(SagatResponseError);
		expect(error.issues[0].path).toEqual([
			'accountAddress',
		]);
	});

	test('maps an error body to SagatApiError with its status', async () => {
		const client = new SagatV1Client('', {
			fetch: replying(404, {
				error: 'The requested resource was not found.',
			}),
		});

		const error = await client
			.getProposal(DIGEST)
			.catch((e) => e);
		expect(error).toBeInstanceOf(SagatApiError);
		expect(error.status).toBe(404);
		expect(error.message).toBe(
			'The requested resource was not found.',
		);
	});
});
