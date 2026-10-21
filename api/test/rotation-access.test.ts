// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Who can read and act for an account once it has several signer sets,
// valid per network (docs/account-rotation.md). `localnet` and `testnet` are
// the two supported networks; both point at the local network. The alias
// mirror and draft links are written directly, see `framework/rotation.ts`.

import { type Network } from '@mysten/sagat';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import { AuthErrors } from '../src/errors';
import {
	ApiTestFramework,
	failureOf,
	newUser,
	type TestUser,
} from './framework/api-test-framework';
import {
	rotationScenario,
	setAliasMirror,
	type RotationScenario,
} from './framework/rotation';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

const ALL: Network[] = ['localnet', 'testnet'];

const accessDenied = {
	status: 403,
	message: AuthErrors.AccessDenied,
};

// The account's signer sets as `[address, validOn]`, in link order.
const validity = (account: {
	signerSets: { address: string; validOn: string[] }[];
}) => account.signerSets.map((s) => [s.address, s.validOn]);

const dashboardOf = async (
	s: RotationScenario,
	user: RotationScenario['k1'],
) =>
	(await (await s.as(user)).v1.getAccounts()).map(
		(a) => a.address,
	);

describe('Rotation: account access', () => {
	let framework: ApiTestFramework;
	let s: RotationScenario;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
		s = await rotationScenario(framework);
	});

	describe('default: no mirror rows', () => {
		test('only the original signer set is valid, on every network', async () => {
			const account = await (
				await s.as(s.k1)
			).v1.getAccount(s.A);
			expect(validity(account)).toEqual([
				[s.S1, ALL],
				[s.S2, []],
				[s.S3, []],
			]);
			expect(account.aliases).toEqual([
				{
					network: 'localnet',
					addresses: [s.A],
					observedAt: null,
				},
				{
					network: 'testnet',
					addresses: [s.A],
					observedAt: null,
				},
			]);
		});

		test('lists every linked signer set with its own link and the account key labels', async () => {
			const account = await (
				await s.as(s.k1)
			).v1.getAccount(s.A);
			expect(account.signerSets).toEqual([
				{
					address: s.S1,
					label: 'Treasury',
					status: 'verified',
					isVerified: true,
					threshold: 2,
					totalWeight: 3,
					draftedBy: s.k1.address,
					createdAt: expect.any(String),
					validOn: ALL,
					members: (
						[
							[s.k1, "k1's Ledger"],
							[s.k2, null],
							[s.k3, 'k3 in Treasury'],
						] as [TestUser, string | null][]
					).map(([key, label], order) => ({
						signerSetAddress: s.S1,
						publicKey: key.publicKey,
						weight: 1,
						order,
						isAccepted: true,
						isRejected: false,
						label,
					})),
				},
				{
					address: s.S2,
					label: 'Operations',
					status: 'verified',
					isVerified: true,
					threshold: 2,
					totalWeight: 2,
					draftedBy: s.k1.address,
					createdAt: expect.any(String),
					validOn: [],
					// The account's label for k3 follows the key into S2.
					members: (
						[
							[s.k3, 'k3 in Treasury'],
							[s.k4, null],
						] as [TestUser, string | null][]
					).map(([key, label], order) => ({
						signerSetAddress: s.S2,
						publicKey: key.publicKey,
						weight: 1,
						order,
						isAccepted: true,
						isRejected: false,
						label,
					})),
				},
				{
					address: s.S3,
					label: 'Board',
					status: 'draft',
					isVerified: false,
					threshold: 2,
					totalWeight: 2,
					draftedBy: s.k1.address,
					createdAt: expect.any(String),
					validOn: [],
					members: [s.k5, s.k6].map((key, order) => ({
						signerSetAddress: s.S3,
						publicKey: key.publicKey,
						weight: 1,
						order,
						isAccepted: false,
						isRejected: false,
						label: null,
					})),
				},
			]);
		});

		test('a member of a set that is linked but in no alias set has no access', async () => {
			expect(
				await failureOf(
					(await s.as(s.k4)).v1.getAccount(s.A),
				),
			).toEqual(accessDenied);
			expect(await dashboardOf(s, s.k4)).toEqual([]);
			expect(await dashboardOf(s, s.k3)).toEqual([s.A]);
		});

		test('a state row saying the alias object does not exist is the same default', async () => {
			for (const network of [
				'localnet',
				'testnet',
			] as const)
				await setAliasMirror(s.A, network, {
					exists: false,
				});
			const account = await (
				await s.as(s.k1)
			).v1.getAccount(s.A);
			expect(validity(account)).toEqual([
				[s.S1, ALL],
				[s.S2, []],
				[s.S3, []],
			]);
			expect(account.aliases).toEqual(
				ALL.map((network) => ({
					network,
					addresses: [s.A],
					observedAt: null,
				})),
			);
		});
	});

	describe('S2 linked on localnet only', () => {
		const observedAt = new Date('2026-10-20T10:00:00.000Z');

		beforeEach(async () => {
			await setAliasMirror(s.A, 'localnet', {
				aliases: [s.A, s.S2],
				observedAt,
			});
		});

		test('S1 is valid everywhere and S2 on localnet only', async () => {
			const account = await (
				await s.as(s.k1)
			).v1.getAccount(s.A);
			expect(validity(account)).toEqual([
				[s.S1, ALL],
				[s.S2, ['localnet']],
				[s.S3, []],
			]);
			expect(account.aliases).toEqual([
				{
					network: 'localnet',
					addresses: [s.A, s.S2].sort(),
					observedAt: observedAt.toISOString(),
				},
				{
					network: 'testnet',
					addresses: [s.A],
					observedAt: null,
				},
			]);
		});

		test('k4, accepted in S2 only, reads the account and sees it on the dashboard', async () => {
			const session = await s.as(s.k4);
			expect(
				(await session.v1.getAccount(s.A)).address,
			).toBe(s.A);
			expect(await dashboardOf(s, s.k4)).toEqual([s.A]);
		});
	});

	describe('S1 retired on localnet', () => {
		beforeEach(async () => {
			await setAliasMirror(s.A, 'localnet', {
				aliases: [s.S2],
			});
		});

		test('k1, only in S1, still reads the account through testnet and sees the divergence', async () => {
			const account = await (
				await s.as(s.k1)
			).v1.getAccount(s.A);
			expect(validity(account)).toEqual([
				[s.S1, ['testnet']],
				[s.S2, ['localnet']],
				[s.S3, []],
			]);
			expect(
				account.aliases.map((a) => [
					a.network,
					a.addresses,
				]),
			).toEqual([
				['localnet', [s.S2]],
				['testnet', [s.A]],
			]);
			expect(await dashboardOf(s, s.k1)).toEqual([s.A]);
		});
	});

	describe('S1 retired on every network', () => {
		beforeEach(async () => {
			for (const network of [
				'localnet',
				'testnet',
			] as const)
				await setAliasMirror(s.A, network, {
					aliases: [s.S2],
				});
		});

		test('k1 and k2, only in S1, lose all access to the account', async () => {
			for (const key of [s.k1, s.k2]) {
				expect(
					await failureOf(
						(await s.as(key)).v1.getAccount(s.A),
					),
				).toEqual(accessDenied);
				expect(await dashboardOf(s, key)).toEqual([]);
			}
		});

		test('S1 stays listed, valid nowhere, for a member of S2', async () => {
			for (const key of [s.k3, s.k4]) {
				const account = await (
					await s.as(key)
				).v1.getAccount(s.A);
				expect(validity(account)).toEqual([
					[s.S1, []],
					[s.S2, ALL],
					[s.S3, []],
				]);
				expect(await dashboardOf(s, key)).toEqual([s.A]);
			}
		});
	});

	describe('aliases that are not linked signer sets', () => {
		test('an unknown alias is listed in `aliases` only', async () => {
			const unknown = newUser().address;
			await setAliasMirror(s.A, 'localnet', {
				aliases: [s.A, unknown],
			});
			const account = await (
				await s.as(s.k1)
			).v1.getAccount(s.A);
			expect(account.aliases[0]).toEqual({
				network: 'localnet',
				addresses: [s.A, unknown].sort(),
				observedAt: expect.any(String),
			});
			expect(validity(account)).toEqual([
				[s.S1, ALL],
				[s.S2, []],
				[s.S3, []],
			]);
		});
	});

	describe('networks', () => {
		test('mirror rows of networks the server does not support are ignored', async () => {
			// Would make S2 valid and retire S1, if they counted.
			await setAliasMirror(s.A, 'mainnet', {
				aliases: [s.S2],
			});
			await setAliasMirror(s.A, 'devnet', {
				aliases: [normalizeSuiAddress('0x1')],
			});
			const account = await (
				await s.as(s.k1)
			).v1.getAccount(s.A);
			expect(account.aliases.map((a) => a.network)).toEqual(
				ALL,
			);
			expect(validity(account)).toEqual([
				[s.S1, ALL],
				[s.S2, []],
				[s.S3, []],
			]);
			expect(
				await failureOf(
					(await s.as(s.k4)).v1.getAccount(s.A),
				),
			).toEqual(accessDenied);
		});
	});
});
