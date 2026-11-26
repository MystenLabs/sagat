// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';

import {
	shownSignerSet,
	type CountedProposal,
} from './proposalUtils';
import { sameAddress } from './sui-utils';
import { sumWeight } from './threshold';

type ExportType =
	'sagat.multisig-composition' | 'sagat.proposal';

interface ExportEnvelope {
	type: ExportType;
	version: number;
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
	version: 1;
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
	publicKey: string;
	signature: string;
	weight: number | null;
	order: number | null;
}

/** Version 2: a `/v1` proposal, with no proposal id. */
interface ExportedProposal extends ExportEnvelope {
	type: 'sagat.proposal';
	version: 2;
	exportedAt: string;
	proposal: {
		digest: string;
		network: string;
		multisigAddress: string;
		status: ProposalStatus;
		statusLabel: string;
		transactionBytes: string;
		proposerAddress: string;
		description: string | null;
		createdAt: string;
		currentWeight: number | null;
		threshold: number | null;
		signatures: ExportedProposalSignature[];
	};
	/** The listed signer set at its own address; null when no set was checked. */
	multisig: ExportedMultisigComposition['multisig'] | null;
}

export function buildMultisigCompositionExport(
	multisig: MultisigCompositionInput,
): ExportedMultisigComposition {
	return {
		type: 'sagat.multisig-composition',
		version: 1,
		multisig: buildMultisigComposition(multisig),
	};
}

/** The proposal with the one signer set the screens show, as its composition. */
export function buildProposalExport(
	proposal: CountedProposal,
	now = new Date(),
): ExportedProposal {
	const shown = shownSignerSet(proposal.checkedSignerSets);
	const multisig =
		shown &&
		buildMultisigComposition({
			address: shown.address,
			// Only the pod's own set goes by the pod's name.
			name: sameAddress(
				shown.address,
				proposal.accountAddress,
			)
				? proposal.accountName
				: null,
			threshold: shown.threshold,
			members: shown.members,
		});
	const memberByPublicKey = new Map(
		(multisig?.members ?? []).map((member) => [
			member.publicKey,
			member,
		]),
	);

	return {
		type: 'sagat.proposal',
		version: 2,
		exportedAt: now.toISOString(),
		proposal: {
			digest: proposal.digest,
			network: proposal.network,
			multisigAddress: proposal.accountAddress,
			status: ProposalStatus[proposal.status],
			statusLabel: proposal.status,
			transactionBytes: proposal.transactionBytes,
			proposerAddress: proposal.proposerAddress,
			description: proposal.description,
			createdAt: proposal.createdAt,
			currentWeight: shown?.currentWeight ?? null,
			threshold: shown?.threshold ?? null,
			signatures: proposal.signatures
				.map(({ publicKey, signature }) => {
					const member = memberByPublicKey.get(publicKey);
					return {
						publicKey,
						signature,
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
		totalWeight: sumWeight(members),
		totalMembers: members.length,
		members,
	};
}

function sanitizeFilenameSegment(value: string) {
	return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
