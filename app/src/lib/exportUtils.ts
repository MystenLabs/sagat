// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	type MultisigWithMembers,
	type PublicProposal,
} from '@mysten/sagat';

type ExportType =
	| 'sagat.multisig-composition'
	| 'sagat.proposal';

interface ExportEnvelope {
	type: ExportType;
	version: 1;
}

interface ExportedMultisigMember {
	publicKey: string;
	weight: number;
	order: number;
}

interface MultisigCompositionInput {
	address: string;
	name: string | null;
	threshold: number;
	members: ExportedMultisigMember[];
}

interface ExportedMultisigComposition extends ExportEnvelope {
	type: 'sagat.multisig-composition';
	multisig: {
		address: string;
		name: string | null;
		threshold: number;
		totalWeight: number;
		totalMembers: number;
		members: ExportedMultisigMember[];
	};
}

interface ExportedProposalSignature {
	proposalId: number;
	publicKey: string;
	signature: string;
	weight: number | null;
	order: number | null;
}

interface ExportedProposal extends ExportEnvelope {
	type: 'sagat.proposal';
	exportedAt: string;
	proposal: {
		id: number;
		digest: string;
		network: string;
		multisigAddress: string;
		status: ProposalStatus;
		statusLabel: string;
		transactionBytes: string;
		proposerAddress: string;
		description: string | null;
		currentWeight: number;
		threshold: number;
		signatures: ExportedProposalSignature[];
	};
	multisig: ExportedMultisigComposition['multisig'];
}

export function buildMultisigCompositionExport(
	multisig: MultisigWithMembers,
): ExportedMultisigComposition {
	return {
		type: 'sagat.multisig-composition',
		version: 1,
		multisig: buildMultisigComposition(multisig),
	};
}

export function buildProposalExport(
	proposal: PublicProposal,
	now = new Date(),
): ExportedProposal {
	const multisig = buildMultisigComposition({
		...proposal.multisig,
		name: proposal.multisig.name ?? null,
	});
	const memberByPublicKey = new Map(
		multisig.members.map((member) => [
			member.publicKey,
			member,
		]),
	);

	return {
		type: 'sagat.proposal',
		version: 1,
		exportedAt: now.toISOString(),
		proposal: {
			id: proposal.id,
			digest: proposal.digest,
			network: proposal.network,
			multisigAddress: proposal.multisigAddress,
			status: proposal.status,
			statusLabel: getProposalStatusLabel(proposal.status),
			transactionBytes: proposal.transactionBytes,
			proposerAddress: proposal.proposerAddress,
			description: proposal.description,
			currentWeight: proposal.currentWeight,
			threshold: proposal.multisig.threshold,
			signatures: proposal.signatures
				.map((signature) => {
					const member = memberByPublicKey.get(
						signature.publicKey,
					);
					return {
						proposalId: signature.proposalId,
						publicKey: signature.publicKey,
						signature: signature.signature,
						weight: member?.weight ?? null,
						order: member?.order ?? null,
					};
				})
				.sort((a, b) => {
					if (a.order === null && b.order === null) {
						return a.publicKey.localeCompare(b.publicKey);
					}
					if (a.order === null) return 1;
					if (b.order === null) return -1;
					return a.order - b.order;
				}),
		},
		multisig,
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
	members: ExportedMultisigMember[],
): ExportedMultisigMember[] {
	return members
		.map((member) => ({
			publicKey: member.publicKey,
			weight: member.weight,
			order: member.order,
		}))
		.sort((a, b) => a.order - b.order);
}

function buildMultisigComposition(
	multisig: MultisigCompositionInput,
): ExportedMultisigComposition['multisig'] {
	const members = getOrderedMembers(multisig.members);

	return {
		address: multisig.address,
		name: multisig.name,
		threshold: multisig.threshold,
		totalWeight: members.reduce(
			(sum, member) => sum + member.weight,
			0,
		),
		totalMembers: members.length,
		members,
	};
}

function getProposalStatusLabel(status: ProposalStatus) {
	return ProposalStatus[status] ?? 'UNKNOWN';
}

function sanitizeFilenameSegment(value: string) {
	return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
