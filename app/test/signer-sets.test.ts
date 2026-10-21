// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	type Account,
	type Network,
	type SignerSetWithMembers,
} from '@mysten/sagat';
import { describe, expect, test } from 'vitest';

import {
	displayedSignerSet,
	getAliasWarnings,
	getKeyMembership,
	getNetworkAccess,
	primarySignerSet,
	signerSetsForKey,
	validSignerSets,
} from '../src/lib/signerSets';

const ACCOUNT = '0xaccount';
const OPS = '0xops';
const BOARD = '0xboard';
const DRAFT = '0xdraft';

const member = (
	signerSetAddress: string,
	publicKey: string,
	{
		isAccepted = true,
		isRejected = false,
	}: { isAccepted?: boolean; isRejected?: boolean } = {},
) => ({
	signerSetAddress,
	publicKey,
	weight: 1,
	order: 0,
	isAccepted,
	isRejected,
	label: null,
});

const set = (
	address: string,
	validOn: Network[],
	members: ReturnType<typeof member>[],
	status: SignerSetWithMembers['status'] = 'verified',
): SignerSetWithMembers => ({
	address,
	label: address.slice(2),
	status,
	isVerified: status === 'verified',
	threshold: 1,
	totalWeight: members.length,
	draftedBy: '0x1',
	createdAt: '2026-10-01T00:00:00.000Z',
	validOn,
	members: members.map((m, order) => ({ ...m, order })),
});

const aliases = (
	byNetwork: Partial<Record<Network, string[]>>,
): Account['aliases'] =>
	Object.entries(byNetwork).map(([network, addresses]) => ({
		network: network as Network,
		addresses: addresses!,
		observedAt: '2026-10-20T00:00:00.000Z',
	}));

// Today's account: one signer set at its own address, valid everywhere.
const todays = {
	address: ACCOUNT,
	signerSets: [
		set(
			ACCOUNT,
			['mainnet', 'testnet'],
			[member(ACCOUNT, 'alice'), member(ACCOUNT, 'bob')],
		),
	],
	aliases: aliases({
		mainnet: [ACCOUNT],
		testnet: [ACCOUNT],
	}),
};

// Rotated on testnet only: the original set is retired there and Ops
// replaces it; mainnet still has the original set. Carol is only in Ops.
// A draft Board set is waiting for its members.
const rotated = {
	address: ACCOUNT,
	signerSets: [
		set(
			ACCOUNT,
			['mainnet'],
			[member(ACCOUNT, 'alice'), member(ACCOUNT, 'bob')],
		),
		set(
			OPS,
			['testnet'],
			[
				member(OPS, 'alice'),
				member(OPS, 'carol'),
				member(OPS, 'dave', { isAccepted: false }),
			],
		),
		set(
			DRAFT,
			[],
			[member(DRAFT, 'erin', { isAccepted: false })],
			'inviting',
		),
	],
	aliases: aliases({
		mainnet: [ACCOUNT],
		testnet: [OPS],
	}),
};

describe('signer sets', () => {
	test("today's account has one set, valid everywhere, shown as before", () => {
		expect(getAliasWarnings(todays)).toEqual([]);
		expect(primarySignerSet(todays)?.address).toBe(ACCOUNT);
		expect(
			getKeyMembership(validSignerSets(todays), 'bob'),
		).toEqual({
			isAccepted: true,
			isRejected: false,
			pendingMembers: 0,
			rejectedMembers: 0,
		});
	});

	test('a set valid on one network only is valid there and nowhere else', () => {
		expect(
			validSignerSets(rotated, 'testnet').map(
				(s) => s.address,
			),
		).toEqual([OPS]);
		expect(
			validSignerSets(rotated, 'mainnet').map(
				(s) => s.address,
			),
		).toEqual([ACCOUNT]);
		// Without a network: valid somewhere, the draft left out.
		expect(
			validSignerSets(rotated).map((s) => s.address),
		).toEqual([ACCOUNT, OPS]);
	});

	test('a retired original set signs nowhere and is not the primary set', () => {
		const retired = {
			...rotated,
			signerSets: [
				{ ...rotated.signerSets[0], validOn: [] },
				{
					...rotated.signerSets[1],
					validOn: ['mainnet', 'testnet'] as Network[],
				},
			],
			aliases: aliases({ mainnet: [OPS], testnet: [OPS] }),
		};
		expect(primarySignerSet(retired)?.address).toBe(OPS);
		expect(
			validSignerSets(retired).map((s) => s.address),
		).toEqual([OPS]);
		// Bob was only in the retired set: he no longer signs for it.
		expect(
			getKeyMembership(validSignerSets(retired), 'bob'),
		).toBeUndefined();
	});

	test('a draft gives no membership', () => {
		expect(
			signerSetsForKey(rotated, 'erin').map(
				(s) => s.address,
			),
		).toEqual([DRAFT]);
		expect(
			getKeyMembership(validSignerSets(rotated), 'erin'),
		).toBeUndefined();
	});

	test('a key only in the second set is a member, counted in that set', () => {
		expect(
			getKeyMembership(validSignerSets(rotated), 'carol'),
		).toEqual({
			isAccepted: true,
			isRejected: false,
			pendingMembers: 1,
			rejectedMembers: 0,
		});
		// Alice is in both: counted once, from both sets.
		expect(
			getKeyMembership(validSignerSets(rotated), 'alice')
				?.pendingMembers,
		).toBe(1);
	});

	test('the primary set is valid on the most networks, ties by link order', () => {
		expect(primarySignerSet(rotated)?.address).toBe(
			ACCOUNT,
		);
		const wider = {
			signerSets: [
				rotated.signerSets[0],
				{
					...rotated.signerSets[1],
					validOn: ['mainnet', 'testnet'] as Network[],
				},
			],
		};
		expect(primarySignerSet(wider)?.address).toBe(OPS);
		expect(
			primarySignerSet({
				signerSets: [rotated.signerSets[2]],
			}),
		).toBeUndefined();
	});

	test('networks that disagree are a warning', () => {
		expect(getAliasWarnings(rotated)).toEqual([
			{
				kind: 'networks-disagree',
				aliasSets: [
					{ network: 'mainnet', addresses: [ACCOUNT] },
					{ network: 'testnet', addresses: [OPS] },
				],
			},
		]);
	});

	test('an alias that is not a signer set of the account is a warning', () => {
		const withRecoveryKey = {
			...todays,
			aliases: aliases({
				mainnet: [ACCOUNT, BOARD],
				testnet: [ACCOUNT, BOARD],
			}),
		};
		expect(getAliasWarnings(withRecoveryKey)).toEqual([
			{
				kind: 'unknown-alias',
				network: 'mainnet',
				address: BOARD,
			},
			{
				kind: 'unknown-alias',
				network: 'testnet',
				address: BOARD,
			},
		]);
	});

	test('the overview shows a set valid on the selected network', () => {
		expect(
			displayedSignerSet(rotated, 'testnet')?.address,
		).toBe(OPS);
		expect(
			displayedSignerSet(rotated, 'mainnet')?.address,
		).toBe(ACCOUNT);
		// Valid nowhere on devnet: fall back to the primary set.
		expect(
			displayedSignerSet(rotated, 'devnet')?.address,
		).toBe(ACCOUNT);
		expect(
			primarySignerSet(rotated, 'testnet')?.address,
		).toBe(OPS);
		// Locked out everywhere: still the original set.
		const lockedOut = {
			address: ACCOUNT,
			signerSets: rotated.signerSets.map((s) => ({
				...s,
				validOn: [] as Network[],
			})),
		};
		expect(
			displayedSignerSet(lockedOut, 'mainnet')?.address,
		).toBe(ACCOUNT);
	});

	test('an account with no set valid on the network is locked out there', () => {
		expect(
			getNetworkAccess(rotated, 'devnet', 'alice'),
		).toBe('locked-out');
		expect(
			getNetworkAccess(rotated, 'devnet', undefined),
		).toBe('locked-out');
	});

	test('keys outside every set valid on the network can view, not sign', () => {
		// Carol is only in Ops, valid on testnet.
		expect(
			getNetworkAccess(rotated, 'mainnet', 'carol'),
		).toBe('not-a-signer');
		expect(
			getNetworkAccess(rotated, 'testnet', 'carol'),
		).toBe('signer');
		// Dave never accepted in Ops; Erin is only in the draft.
		expect(
			getNetworkAccess(rotated, 'testnet', 'dave'),
		).toBe('not-a-signer');
		expect(
			getNetworkAccess(rotated, 'testnet', 'erin'),
		).toBe('not-a-signer');
		expect(getNetworkAccess(todays, 'mainnet', 'bob')).toBe(
			'signer',
		);
	});
});
