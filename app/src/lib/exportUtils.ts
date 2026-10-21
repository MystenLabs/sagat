// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	type Account,
	type ProposalSignerSet,
	type PublicProposal,
	type PublicSignerSetMember,
	type SignerSetMember,
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

// The fields an export keeps, picked so a new API field does not change
// the file format.
type ExportedSignerSetMember = Pick<
	SignerSetMember,
	'publicKey' | 'weight' | 'order'
>;

interface ExportedSignerSet {
	address: string;
	label: string | null;
	status: SignerSetWithMembers['status'];
	// Where the set can sign for the account. Empty for a draft, an
	// abandoned set, or one retired everywhere.
	validOn: SignerSetWithMembers['validOn'];
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

type ExportedProposalSignerSet = Pick<
	ProposalSignerSet,
	| 'address'
	| 'label'
	| 'threshold'
	| 'totalWeight'
	| 'currentWeight'
	| 'hasReachedThreshold'
> & {
	members: Pick<
		PublicSignerSetMember,
		'publicKey' | 'weight' | 'order' | 'hasSigned'
	>[];
};

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
	// The signer sets valid on the proposal's network, with the progress
	// in each, as the server counts it. Combine only the signatures of one
	// set's members, in order.
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
			const members = getOrderedMembers(
				signerSet.members,
				toExportedMember,
			);
			return {
				address: signerSet.address,
				label: signerSet.label,
				status: signerSet.status,
				validOn: signerSet.validOn,
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

// `members` in their order, each built by `toExported`.
function getOrderedMembers<M extends { order: number }, E>(
	members: M[],
	toExported: (member: M) => E,
): E[] {
	return [...members]
		.sort((a, b) => a.order - b.order)
		.map(toExported);
}

function toExportedMember(
	member: ExportedSignerSetMember,
): ExportedSignerSetMember {
	return {
		publicKey: member.publicKey,
		weight: member.weight,
		order: member.order,
	};
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
		members: getOrderedMembers(
			signerSet.members,
			(member) => ({
				...toExportedMember(member),
				hasSigned: member.hasSigned,
			}),
		),
	};
}

function getProposalStatusLabel(status: ProposalStatus) {
	return ProposalStatus[status] ?? 'UNKNOWN';
}

function sanitizeFilenameSegment(value: string) {
	return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
