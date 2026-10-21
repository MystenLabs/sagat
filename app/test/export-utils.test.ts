// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	type Account,
	type PublicProposal,
} from '@mysten/sagat';
import { describe, expect, test } from 'vitest';

import {
	buildMultisigCompositionExport,
	buildProposalExport,
	getMultisigExportFilename,
	getProposalExportFilename,
} from '../src/lib/exportUtils';
import { member } from './fixtures';

const exportedAt = new Date('2026-04-28T06:30:00.000Z');

// A member of the account's original signer set.
const accountMember = (
	publicKey: string,
	weight: number,
	order: number,
	isAccepted: boolean,
) =>
	member('0xaccount', publicKey, {
		weight,
		order,
		isAccepted,
	});

const account: Account = {
	address: '0xaccount',
	name: 'Treasury',
	createdAt: '2026-04-01T00:00:00.000Z',
	proposers: [],
	signerSets: [
		{
			address: '0xaccount',
			label: 'Treasury',
			status: 'inviting',
			isVerified: false,
			threshold: 3,
			totalWeight: 6,
			draftedBy: '0xcreator',
			createdAt: '2026-04-01T00:00:00.000Z',
			validOn: ['mainnet', 'testnet'],
			members: [
				accountMember('member-c', 3, 2, false),
				accountMember('member-a', 1, 0, true),
				accountMember('member-b', 2, 1, true),
			],
		},
		// A draft: listed, valid nowhere.
		{
			address: '0xdraft',
			label: 'Operations',
			status: 'draft',
			isVerified: false,
			threshold: 1,
			totalWeight: 1,
			draftedBy: '0xcreator',
			createdAt: '2026-04-02T00:00:00.000Z',
			validOn: [],
			members: [accountMember('member-a', 1, 0, true)],
		},
	],
	aliases: [
		{
			network: 'mainnet',
			addresses: ['0xaccount'],
			observedAt: null,
		},
		{
			network: 'testnet',
			addresses: ['0xaccount'],
			observedAt: null,
		},
	],
};

describe('export utils', () => {
	test('builds a narrow account composition export', () => {
		const result = buildMultisigCompositionExport(account);

		expect(result).toEqual({
			type: 'sagat.multisig-composition',
			version: 2,
			account: {
				address: '0xaccount',
				name: 'Treasury',
			},
			signerSets: [
				{
					address: '0xaccount',
					label: 'Treasury',
					status: 'inviting',
					validOn: ['mainnet', 'testnet'],
					threshold: 3,
					totalWeight: 6,
					totalMembers: 3,
					members: [
						{ publicKey: 'member-a', weight: 1, order: 0 },
						{ publicKey: 'member-b', weight: 2, order: 1 },
						{ publicKey: 'member-c', weight: 3, order: 2 },
					],
				},
				{
					address: '0xdraft',
					label: 'Operations',
					status: 'draft',
					validOn: [],
					threshold: 1,
					totalWeight: 1,
					totalMembers: 1,
					members: [
						{ publicKey: 'member-a', weight: 1, order: 0 },
					],
				},
			],
		});
	});

	test('exports each signer set with its progress, as the server counts it', () => {
		const proposal: PublicProposal = {
			id: 42,
			digest: '0xdigest',
			status: ProposalStatus.PENDING,
			transactionBytes: 'transaction-bytes',
			proposerAddress: '0xproposer',
			description: 'Pay supplier',
			network: 'testnet',
			accountAddress: '0xaccount',
			createdAt: '2026-04-28T06:00:00.000Z',
			executedVia: null,
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
			signerSets: [
				{
					address: '0xaccount',
					label: 'Treasury',
					threshold: 3,
					totalWeight: 6,
					currentWeight: 3,
					hasReachedThreshold: true,
					members: [
						{
							publicKey: 'member-b',
							weight: 2,
							order: 1,
							hasSigned: true,
						},
						{
							publicKey: 'member-a',
							weight: 1,
							order: 0,
							hasSigned: true,
						},
						{
							publicKey: 'member-c',
							weight: 3,
							order: 2,
							hasSigned: false,
						},
					],
				},
			],
		};

		const result = buildProposalExport(
			proposal,
			exportedAt,
		);

		expect(result).toEqual({
			type: 'sagat.proposal',
			version: 2,
			exportedAt: exportedAt.toISOString(),
			proposal: {
				id: 42,
				digest: '0xdigest',
				network: 'testnet',
				accountAddress: '0xaccount',
				status: ProposalStatus.PENDING,
				statusLabel: 'PENDING',
				transactionBytes: 'transaction-bytes',
				proposerAddress: '0xproposer',
				description: 'Pay supplier',
				createdAt: '2026-04-28T06:00:00.000Z',
				executedVia: null,
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
			},
			signerSets: [
				{
					address: '0xaccount',
					label: 'Treasury',
					threshold: 3,
					totalWeight: 6,
					currentWeight: 3,
					hasReachedThreshold: true,
					members: [
						{
							publicKey: 'member-a',
							weight: 1,
							order: 0,
							hasSigned: true,
						},
						{
							publicKey: 'member-b',
							weight: 2,
							order: 1,
							hasSigned: true,
						},
						{
							publicKey: 'member-c',
							weight: 3,
							order: 2,
							hasSigned: false,
						},
					],
				},
			],
		});
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
