// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	type MultisigWithMembers,
} from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';
import { describe, expect, test } from 'vitest';

import {
	buildMultisigCompositionExport,
	buildProposalExport,
	getMultisigExportFilename,
	getProposalExportFilename,
} from '../src/lib/exportUtils';
import { type CountedProposal } from '../src/lib/proposalUtils';
import { v1Proposal } from './proposal';
import { listedSet, signerSet } from './signer-set';

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
		const proposal: CountedProposal = {
			...v1Proposal({
				digest: '0xdigest',
				ready: true,
				transactionBytes: 'transaction-bytes',
				proposerAddress: '0xproposer',
				description: 'Pay supplier',
				createdAt: '2026-10-13T08:55:00.000Z',
				network: 'testnet',
				accountAddress: '0xmultisig',
				accountName: 'Treasury',
			}),
			signatures: [
				{
					publicKey: 'member-b',
					signature: 'sig-b',
				},
				{
					publicKey: 'member-a',
					signature: 'sig-a',
				},
			],
			checkedSignerSets: [
				{
					address: '0xmultisig',
					threshold: 3,
					currentWeight: 3,
					members: [
						{ publicKey: 'member-b', weight: 2, order: 1 },
						{ publicKey: 'member-a', weight: 1, order: 0 },
						{ publicKey: 'member-c', weight: 3, order: 2 },
					],
				},
			],
		};

		const result = buildProposalExport(
			proposal,
			exportedAt,
		);

		expect(result).toMatchObject({
			type: 'sagat.proposal',
			version: 2,
			exportedAt: exportedAt.toISOString(),
			proposal: {
				digest: '0xdigest',
				network: 'testnet',
				multisigAddress: '0xmultisig',
				status: ProposalStatus.PENDING,
				statusLabel: 'PENDING',
				transactionBytes: 'transaction-bytes',
				proposerAddress: '0xproposer',
				description: 'Pay supplier',
				createdAt: '2026-10-13T08:55:00.000Z',
				currentWeight: 3,
				threshold: 3,
				signatures: [
					{
						publicKey: 'member-a',
						signature: 'sig-a',
						weight: 1,
						order: 0,
					},
					{
						publicKey: 'member-b',
						signature: 'sig-b',
						weight: 2,
						order: 1,
					},
				],
			},
		});
		expect(result.multisig?.address).toBe('0xmultisig');
		expect(result.multisig?.name).toBe('Treasury');
		expect(result.multisig?.members).toEqual([
			{ publicKey: 'member-a', weight: 1, order: 0 },
			{ publicKey: 'member-b', weight: 2, order: 1 },
			{ publicKey: 'member-c', weight: 3, order: 2 },
		]);
	});

	test('names and addresses the composition after the signer set it lists, and has none without a checked set', () => {
		const added = signerSet(
			[new Ed25519Keypair(), new Ed25519Keypair()],
			2,
		);
		const proposal = (
			checkedSignerSets: CountedProposal['checkedSignerSets'],
		): CountedProposal => ({
			...v1Proposal({
				accountAddress: '0x1',
				accountName: 'Treasury',
			}),
			checkedSignerSets,
		});

		const { proposal: exported, multisig: composition } =
			buildProposalExport(proposal([listedSet(added)]));
		expect(exported.multisigAddress).toBe('0x1');
		expect(composition?.address).toBe(added.address);
		expect(composition?.name).toBeNull();
		expect(
			MultiSigPublicKey.fromPublicKeys({
				threshold: composition!.threshold,
				publicKeys: composition!.members.map(
					({ publicKey, weight }) => ({
						publicKey: publicKeyFromSuiBytes(publicKey),
						weight,
					}),
				),
			}).toSuiAddress(),
		).toBe(added.address);

		const unchecked = buildProposalExport(proposal([]));
		expect(unchecked.multisig).toBeNull();
		expect(unchecked.proposal.currentWeight).toBeNull();
		expect(unchecked.proposal.threshold).toBeNull();
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
