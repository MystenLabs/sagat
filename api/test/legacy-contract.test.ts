// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Golden test for the frozen legacy API contract.
 *
 * Drives the legacy routes through the old SDK, records every response, and
 * compares the normalized recording with `golden/legacy-contract.json`.
 * Values that change between runs (addresses, keys, signatures, digests,
 * transaction bytes, ids, timestamps) are replaced with placeholders; field
 * names, field order, nulls and every other value must match exactly.
 *
 * A failure means a legacy response changed. Fix the route, or, if the change
 * is intended, regenerate with `UPDATE_GOLDEN=1 bun test test/legacy-contract`
 * and commit the fixture diff. See golden/README.md.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProposalStatus } from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import { expect, test } from 'bun:test';
import { type Hono } from 'hono';

import {
	ApiTestFramework,
	newUser,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import { getLocalClient } from './setup/sui-network';

setupSharedTestEnvironment();

const GOLDEN_FILE = join(
	__dirname,
	'golden/legacy-contract.json',
);

interface RecordedCall {
	route: string;
	status: number;
	body: unknown;
}

type Kind =
	| 'address'
	| 'publicKey'
	| 'signature'
	| 'digest'
	| 'txBytes'
	| 'id'
	| 'opaque';

// Fields whose value is random by nature, by name.
const FIELD_KINDS: Record<string, Kind> = {
	address: 'address',
	multisigAddress: 'address',
	proposerAddress: 'address',
	addedBy: 'address',
	publicKey: 'publicKey',
	signature: 'signature',
	digest: 'digest',
	transactionBytes: 'txBytes',
	id: 'id',
	proposalId: 'id',
	nextCursor: 'id',
};

const ADDRESS = /^0x[0-9a-f]{64}$/;
const BASE64_PUBLIC_KEY =
	/^[A-Za-z0-9+/]{43}[A-Za-z0-9+/=]$/;
const OPAQUE = /^[A-Za-z0-9+/=_-]{32,}$/;

/**
 * Replaces random values with `<kind:n>` placeholders, numbered per kind in
 * order of first appearance. The same raw value always gets the same
 * placeholder, so references between responses stay visible. Ids keep their
 * JSON type: a numeric id becomes `<id:n>`, an id sent as a string becomes
 * `<id:n:string>`.
 */
class Normalizer {
	#placeholders = new Map<string, string>();
	#ids = new Map<string, number>();
	#counters = new Map<Kind, number>();

	#next(kind: Kind) {
		const n = this.#counters.get(kind) ?? 0;
		this.#counters.set(kind, n + 1);
		return n;
	}

	#token(kind: Kind, raw: string) {
		const existing = this.#placeholders.get(raw);
		if (existing) return existing;
		const placeholder = `<${kind}:${this.#next(kind)}>`;
		this.#placeholders.set(raw, placeholder);
		return placeholder;
	}

	#id(raw: string | number, asString: boolean) {
		const key = String(raw);
		let n = this.#ids.get(key);
		if (n === undefined) {
			n = this.#next('id');
			this.#ids.set(key, n);
		}
		return asString ? `<id:${n}:string>` : `<id:${n}>`;
	}

	#classify(value: string): Kind | undefined {
		if (ADDRESS.test(value)) return 'address';
		if (
			BASE64_PUBLIC_KEY.test(value) &&
			Buffer.from(value, 'base64').length === 33
		)
			return 'publicKey';
		if (OPAQUE.test(value)) return 'opaque';
		return undefined;
	}

	string(value: string, field?: string): string {
		if (
			field &&
			/At$/.test(field) &&
			!isNaN(Date.parse(value))
		)
			return '<timestamp>';
		const fieldKind = field
			? FIELD_KINDS[field]
			: undefined;
		if (fieldKind === 'id') return this.#id(value, true);
		if (this.#placeholders.has(value))
			return this.#placeholders.get(value)!;
		const kind = fieldKind ?? this.#classify(value);
		if (kind) return this.#token(kind, value);
		// Free text (messages): keep it, but hide any address it mentions.
		return value.replace(/0x[0-9a-f]{64}/g, (a) =>
			this.#token('address', a),
		);
	}

	value(value: unknown, field?: string): unknown {
		if (Array.isArray(value))
			return value.map((v) => this.value(v, field));
		if (value && typeof value === 'object')
			return Object.fromEntries(
				Object.entries(value).map(([k, v]) => [
					this.string(k),
					this.value(v, k),
				]),
			);
		if (typeof value === 'string')
			return this.string(value, field);
		if (
			typeof value === 'number' &&
			field &&
			FIELD_KINDS[field] === 'id'
		)
			return this.#id(value, false);
		return value;
	}

	route(method: string, path: string): string {
		const url = new URL(path, 'http://placeholder');
		const segments = url.pathname
			.split('/')
			.map((s) => decodeURIComponent(s))
			.map((s) =>
				/^\d+$/.test(s)
					? this.#id(s, false)
					: this.string(s),
			);
		const query = [...url.searchParams.entries()]
			.map(([k, v]) => `${k}=${this.string(v, k)}`)
			.join('&');
		return `${method} ${segments.join('/')}${query ? `?${query}` : ''}`;
	}
}

/** Wraps the app so every request and its JSON response are recorded. */
function recordingApp(
	app: Hono,
	calls: RecordedCall[],
): Hono {
	const request = async (
		path: string,
		init?: RequestInit,
	): Promise<Response> => {
		const response = await app.request(path, init);
		const text = await response.clone().text();
		let body: unknown = text;
		try {
			body = JSON.parse(text);
		} catch {
			// Not JSON; keep the raw text.
		}
		calls.push({
			route: `${init?.method ?? 'GET'} ${path}`,
			status: response.status,
			body,
		});
		return response;
	};
	return { request } as unknown as Hono;
}

/** A transfer of `amount` MIST from the multisig to `recipient`, proposed by `proposer`. */
async function proposeTransfer(
	session: TestSession,
	proposer: TestUser,
	multisigAddress: string,
	recipient: string,
	amount: number,
	description?: string,
) {
	const tx = new Transaction();
	tx.setSender(multisigAddress);
	const [coin] = tx.splitCoins(tx.gas, [amount]);
	tx.transferObjects([coin], recipient);
	return session.createProposal(
		proposer,
		multisigAddress,
		'localnet',
		(
			await tx.build({ client: getLocalClient() })
		).toBase64(),
		description,
	);
}

/** The legacy flow. Keep the order stable: placeholders depend on it. */
async function driveLegacyRoutes(app: Hono) {
	const framework = new ApiTestFramework(app);

	// Treasury: 2-of-3, funded, all members accepted, plus a proposer.
	const { session, users } =
		await framework.createAuthenticatedSession(3);
	const client = session.client;
	await client.registerAddresses();
	const multisig = await session.createMultisig(users, 2, {
		name: 'Treasury',
		labels: ["Alice's Ledger", null, 'Ops key'],
		fund: true,
	});
	for (const user of users.slice(1))
		await session.acceptMultisig(user, multisig.address);
	const bot = newUser();
	await session.addProposer(
		users[0],
		bot.address,
		multisig.address,
	);
	await client.getMultisig(multisig.address);
	await client.getMultisigConnections();

	// An unnamed multisig: one invitee rejects, the other accepts.
	const { session: other, users: invitees } =
		await framework.createAuthenticatedSession(2);
	const otherClient = other.client;
	await otherClient.registerAddresses();
	const pending = await session.createMultisig(
		[users[0], invitees[0], invitees[1]],
		2,
	);
	await otherClient.getInvitations(invitees[0].publicKey);
	await other.rejectMultisig(invitees[1], pending.address);
	await otherClient.getInvitations(invitees[1].publicKey, {
		showRejected: true,
	});
	await other.acceptMultisig(invitees[0], pending.address);
	await otherClient.getMultisigConnections();

	// Proposal by a member: vote, list, read, cancel, verify.
	const first = await proposeTransfer(
		session,
		users[0],
		multisig.address,
		users[2].address,
		1000,
		'pay vendor',
	);
	await session.voteOnProposal(
		users[1],
		first.id,
		first.transactionBytes,
	);
	await client.getProposals(
		multisig.address,
		'localnet',
		{},
	);
	await client.getProposalByDigest(first.digest);
	await session.cancelProposal(users[0], first.id);
	await client.verifyProposal(first.id);
	await client.verifyProposalByDigest(first.digest);

	// Proposal by the proposer (not a member), then remove the proposer.
	const second = await proposeTransfer(
		session,
		bot,
		multisig.address,
		users[2].address,
		2000,
	);
	await client.getProposals(multisig.address, 'localnet', {
		status: ProposalStatus.PENDING,
	});
	await client.getProposalByDigest(second.digest);
	await session.removeProposer(
		users[0],
		bot.address,
		multisig.address,
	);
	await client.getMultisig(multisig.address);
}

test('legacy routes keep their JSON contract', async () => {
	const calls: RecordedCall[] = [];
	await driveLegacyRoutes(
		recordingApp(await createTestApp(), calls),
	);

	const normalizer = new Normalizer();
	const actual = calls.map((call) => {
		const [method, path] = call.route.split(' ');
		return {
			route: normalizer.route(method, path),
			status: call.status,
			body: normalizer.value(call.body),
		};
	});

	if (process.env.UPDATE_GOLDEN === '1') {
		writeFileSync(
			GOLDEN_FILE,
			`${JSON.stringify(actual, null, '\t')}\n`,
		);
		console.warn(
			`UPDATE_GOLDEN=1: rewrote ${GOLDEN_FILE} (${actual.length} calls). Review the diff before committing.`,
		);
		return;
	}

	const expected: typeof actual = JSON.parse(
		readFileSync(GOLDEN_FILE, 'utf8'),
	);

	// Compare call by call so the first changed response is the one reported.
	const length = Math.max(actual.length, expected.length);
	for (let i = 0; i < length; i++) {
		const label = `call #${i}: ${expected[i]?.route ?? actual[i]?.route}`;
		expect(actual[i], label).toEqual(expected[i]);
		// toEqual ignores key order; the contract does not.
		expect(
			JSON.stringify(actual[i], null, 2),
			`${label} (field order)`,
		).toBe(JSON.stringify(expected[i], null, 2));
	}
});
