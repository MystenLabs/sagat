// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	type Account,
	type Network,
	type SignerSetMember,
	type SignerSetWithMembers,
} from '@mysten/sagat';
import { describe, expect, test } from 'vitest';

import {
	getKeyMembership,
	getNetworkAccess,
	signerSetsForKey,
	summarySignerSet,
	validSignerSets,
} from '../src/lib/signerSets';
import { member } from './fixtures';

const ACCOUNT = '0xaccount';
const OPS = '0xops';
const DRAFT = '0xdraft';

const set = (
	address: string,
	validOn: Network[],
	members: SignerSetMember[],
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
		expect(summarySignerSet(todays)?.address).toBe(ACCOUNT);
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
		expect(summarySignerSet(retired)?.address).toBe(OPS);
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
			signerSetsForKey(rotated.signerSets, 'erin').map(
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
		expect(summarySignerSet(rotated)?.address).toBe(
			ACCOUNT,
		);
		const wider = {
			address: ACCOUNT,
			signerSets: [
				rotated.signerSets[0],
				{
					...rotated.signerSets[1],
					validOn: ['mainnet', 'testnet'] as Network[],
				},
			],
		};
		expect(summarySignerSet(wider)?.address).toBe(OPS);
	});

	test('the overview shows a set valid on the selected network', () => {
		expect(
			summarySignerSet(rotated, 'testnet')?.address,
		).toBe(OPS);
		expect(
			summarySignerSet(rotated, 'mainnet')?.address,
		).toBe(ACCOUNT);
		// Valid nowhere on devnet: fall back to the primary set.
		expect(
			summarySignerSet(rotated, 'devnet')?.address,
		).toBe(ACCOUNT);
		// Locked out everywhere: still the original set.
		const lockedOut = {
			address: ACCOUNT,
			signerSets: rotated.signerSets.map((s) => ({
				...s,
				validOn: [] as Network[],
			})),
		};
		expect(
			summarySignerSet(lockedOut, 'mainnet')?.address,
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
