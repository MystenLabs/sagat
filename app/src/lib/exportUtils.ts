// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	type Account,
	type ProposalSignerSet,
	type PublicProposal,
	type SignerSetWithMembers,
} from '@mysten/sagat';

type ExportType =
	'sagat.multisig-composition' | 'sagat.proposal';

// Version 2 names the account and its signer sets apart (`accountAddress`,
// `signerSets`); version 1 files had a single `multisig`.
interface ExportEnvelope {
	type: ExportType;
	version: 2;
}

interface ExportedSignerSetMember {
	publicKey: string;
	weight: number;
	order: number;
}

interface ExportedSignerSet {
	address: string;
	label: string | null;
	status: SignerSetWithMembers['status'];
	threshold: number;
	totalWeight: number;
	totalMembers: number;
	members: ExportedSignerSetMember[];
}

interface ExportedAccountComposition extends ExportEnvelope {
	type: 'sagat.multisig-composition';
	account: {
		address: string;
		name: string | null;
	};
	signerSets: ExportedSignerSet[];
}

interface ExportedProposalSignerSet {
	address: string;
	label: string | null;
	threshold: number;
	totalWeight: number;
	currentWeight: number;
	hasReachedThreshold: boolean;
	members: (ExportedSignerSetMember & {
		hasSigned: boolean;
	})[];
}

interface ExportedProposal extends ExportEnvelope {
	type: 'sagat.proposal';
	exportedAt: string;
	proposal: {
		id: number;
		digest: string;
		network: string;
		accountAddress: string;
		status: ProposalStatus;
		statusLabel: string;
		transactionBytes: string;
		proposerAddress: string;
		description: string | null;
		createdAt: string;
		executedVia: string | null;
		// Each signature belongs to a key; its weight and order depend on
		// the signer set, so they are listed under `signerSets`.
		signatures: {
			proposalId: number;
			publicKey: string;
			signature: string;
		}[];
	};
	// The signer sets that can execute the proposal, with the progress in
	// each. Combine only the signatures of one set's members, in order.
	signerSets: ExportedProposalSignerSet[];
}

export function buildMultisigCompositionExport(
	account: Pick<Account, 'address' | 'name' | 'signerSets'>,
): ExportedAccountComposition {
	return {
		type: 'sagat.multisig-composition',
		version: 2,
		account: {
			address: account.address,
			name: account.name,
		},
		signerSets: account.signerSets.map((signerSet) => {
			const members = getOrderedMembers(signerSet.members);
			return {
				address: signerSet.address,
				label: signerSet.label,
				status: signerSet.status,
				threshold: signerSet.threshold,
				totalWeight: signerSet.totalWeight,
				totalMembers: members.length,
				members,
			};
		}),
	};
}

export function buildProposalExport(
	proposal: PublicProposal,
	now = new Date(),
): ExportedProposal {
	return {
		type: 'sagat.proposal',
		version: 2,
		exportedAt: now.toISOString(),
		proposal: {
			id: proposal.id,
			digest: proposal.digest,
			network: proposal.network,
			accountAddress: proposal.accountAddress,
			status: proposal.status,
			statusLabel: getProposalStatusLabel(proposal.status),
			transactionBytes: proposal.transactionBytes,
			proposerAddress: proposal.proposerAddress,
			description: proposal.description,
			createdAt: proposal.createdAt,
			executedVia: proposal.executedVia,
			signatures: proposal.signatures.map((signature) => ({
				proposalId: signature.proposalId,
				publicKey: signature.publicKey,
				signature: signature.signature,
			})),
		},
		signerSets: proposal.signerSets.map(
			buildProposalSignerSet,
		),
	};
}

export function downloadJson(
	filename: string,
	data: unknown,
) {
	const blob = new Blob(
		[`${JSON.stringify(data, null, 2)}\n`],
		{
			type: 'application/json;charset=utf-8',
		},
	);
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export function getMultisigExportFilename(
	multisigAddress: string,
) {
	return `sagat-multisig-${sanitizeFilenameSegment(multisigAddress)}.json`;
}

export function getProposalExportFilename(digest: string) {
	return `sagat-proposal-${sanitizeFilenameSegment(digest)}.json`;
}

function getOrderedMembers(
	members: ExportedSignerSetMember[],
): ExportedSignerSetMember[] {
	return members
		.map((member) => ({
			publicKey: member.publicKey,
			weight: member.weight,
			order: member.order,
		}))
		.sort((a, b) => a.order - b.order);
}

function buildProposalSignerSet(
	signerSet: ProposalSignerSet,
): ExportedProposalSignerSet {
	return {
		address: signerSet.address,
		label: signerSet.label,
		threshold: signerSet.threshold,
		totalWeight: signerSet.totalWeight,
		currentWeight: signerSet.currentWeight,
		hasReachedThreshold: signerSet.hasReachedThreshold,
		members: [...signerSet.members]
			.sort((a, b) => a.order - b.order)
			.map((member) => ({
				publicKey: member.publicKey,
				weight: member.weight,
				order: member.order,
				hasSigned: member.hasSigned,
			})),
	};
}

function getProposalStatusLabel(status: ProposalStatus) {
	return ProposalStatus[status] ?? 'UNKNOWN';
}

function sanitizeFilenameSegment(value: string) {
	return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
