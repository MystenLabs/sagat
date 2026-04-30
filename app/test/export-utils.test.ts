// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	type MultisigWithMembers,
	type PublicProposal,
} from '@mysten/sagat';
import { describe, expect, test } from 'vitest';

import {
	buildMultisigCompositionExport,
	buildProposalExport,
	getMultisigExportFilename,
	getProposalExportFilename,
} from '../src/lib/exportUtils';

const exportedAt = new Date('2026-04-28T06:30:00.000Z');

const multisig: MultisigWithMembers = {
	address: '0xmultisig',
	isVerified: false,
	threshold: 3,
	name: 'Treasury',
	totalMembers: 3,
	totalWeight: 6,
	proposers: [],
	members: [
		{
			multisigAddress: '0xmultisig',
			publicKey: 'member-c',
			weight: 3,
			isAccepted: false,
			isRejected: false,
			order: 2,
		},
		{
			multisigAddress: '0xmultisig',
			publicKey: 'member-a',
			weight: 1,
			isAccepted: true,
			isRejected: false,
			order: 0,
		},
		{
			multisigAddress: '0xmultisig',
			publicKey: 'member-b',
			weight: 2,
			isAccepted: true,
			isRejected: false,
			order: 1,
		},
	],
};

describe('export utils', () => {
	test('builds a narrow multisig composition export', () => {
		const result = buildMultisigCompositionExport(multisig);

		expect(result).toEqual({
			type: 'sagat.multisig-composition',
			version: 1,
			multisig: {
				address: '0xmultisig',
				name: 'Treasury',
				threshold: 3,
				totalWeight: 6,
				totalMembers: 3,
				members: [
					{ publicKey: 'member-a', weight: 1, order: 0 },
					{ publicKey: 'member-b', weight: 2, order: 1 },
					{ publicKey: 'member-c', weight: 3, order: 2 },
				],
			},
		});
	});

	test('associates proposal signatures with multisig member weights', () => {
		const proposal: PublicProposal = {
			id: 42,
			digest: '0xdigest',
			status: ProposalStatus.PENDING,
			transactionBytes: 'transaction-bytes',
			proposerAddress: '0xproposer',
			description: 'Pay supplier',
			totalWeight: 3,
			currentWeight: 3,
			network: 'testnet',
			multisigAddress: '0xmultisig',
			signatures: [
				{
					proposalId: 42,
					publicKey: 'member-b',
					signature: 'sig-b',
				},
				{
					proposalId: 42,
					publicKey: 'member-a',
					signature: 'sig-a',
				},
			],
			multisig: {
				address: '0xmultisig',
				name: 'Treasury',
				threshold: 3,
				members: [
					{ publicKey: 'member-b', weight: 2, order: 1 },
					{ publicKey: 'member-a', weight: 1, order: 0 },
					{ publicKey: 'member-c', weight: 3, order: 2 },
				],
			},
		};

		const result = buildProposalExport(
			proposal,
			exportedAt,
		);

		expect(result).toMatchObject({
			type: 'sagat.proposal',
			version: 1,
			exportedAt: exportedAt.toISOString(),
			proposal: {
				id: 42,
				digest: '0xdigest',
				network: 'testnet',
				multisigAddress: '0xmultisig',
				status: ProposalStatus.PENDING,
				statusLabel: 'PENDING',
				transactionBytes: 'transaction-bytes',
				proposerAddress: '0xproposer',
				description: 'Pay supplier',
				currentWeight: 3,
				threshold: 3,
				signatures: [
					{
						proposalId: 42,
						publicKey: 'member-a',
						signature: 'sig-a',
						weight: 1,
						order: 0,
					},
					{
						proposalId: 42,
						publicKey: 'member-b',
						signature: 'sig-b',
						weight: 2,
						order: 1,
					},
				],
			},
		});
		expect(result.multisig.name).toBe('Treasury');
		expect(result.multisig.members).toEqual([
			{ publicKey: 'member-a', weight: 1, order: 0 },
			{ publicKey: 'member-b', weight: 2, order: 1 },
			{ publicKey: 'member-c', weight: 3, order: 2 },
		]);
	});

	test('sanitizes export filenames', () => {
		expect(getMultisigExportFilename('0xabc/def')).toBe(
			'sagat-multisig-0xabc_def.json',
		);
		expect(getProposalExportFilename('abc:def')).toBe(
			'sagat-proposal-abc_def.json',
		);
	});
});
