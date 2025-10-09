import { and, desc, eq, inArray, lt } from 'drizzle-orm';

import { db } from '../db';
import {
	ProposalStatus,
	ProposalWithSignatures,
	SchemaProposals,
	SchemaProposalSignatures,
} from '../db/schema';
import { ValidationError } from '../errors';
import { getSuiClient, SuiNetwork } from '../utils/client';
import {
	paginateResponse,
	PaginationCursor,
} from '../utils/pagination';
import { getMultisig } from './multisig.service';

// Get a proposal by id, and its signatures.
export const getProposalById = async (
	proposalId: number,
): Promise<ProposalWithSignatures> => {
	const result = await db
		.select()
		.from(SchemaProposals)
		.leftJoin(
			SchemaProposalSignatures,
			eq(
				SchemaProposals.id,
				SchemaProposalSignatures.proposalId,
			),
		)
		.where(eq(SchemaProposals.id, proposalId));

	if (!result || result.length === 0)
		throw new ValidationError('Proposal not found');

	const proposal = result[0].proposals;
	const signatures = result
		.filter((row) => row.proposal_signatures !== null)
		.map((row) => row.proposal_signatures)
		.filter((x) => !!x);

	return {
		...proposal,
		signatures: signatures.map((s) => ({
			publicKey: s.publicKey,
			signature: s.signature,
			proposalId: s.proposalId,
		})),
	};
};

export const getProposalsByMultisigAddress = async (
	multisigAddress: string,
	network: string,
	cursor: PaginationCursor,
	status?: ProposalStatus,
) => {
	// the next cursor.
	const nextCursor =
		cursor?.nextCursor && !isNaN(Number(cursor.nextCursor))
			? Number(cursor.nextCursor)
			: undefined;

	// Get the list of proposals.
	const proposals = await db.query.SchemaProposals.findMany(
		{
			where: and(
				eq(
					SchemaProposals.multisigAddress,
					multisigAddress,
				),
				status
					? eq(SchemaProposals.status, status)
					: undefined,
				eq(SchemaProposals.network, network),
				nextCursor
					? lt(SchemaProposals.id, nextCursor)
					: undefined,
			),
			limit: cursor?.perPage + 1,
			orderBy: [desc(SchemaProposals.id)],
		},
	);
	// If we have more results than our page size, we have a next page.
	const hasNextPage = proposals.length > cursor.perPage;

	const page = proposals.slice(0, cursor.perPage);

	// Get the list of signatures for each one of those.
	const signatures =
		await db.query.SchemaProposalSignatures.findMany({
			where: inArray(
				SchemaProposalSignatures.proposalId,
				proposals.map((p) => p.id),
			),
		});

	const result: ProposalWithSignatures[] = [];

	for (const proposal of page) {
		const signaturesForProposal = signatures.filter(
			(s) => s.proposalId === proposal.id,
		);
		result.push({
			...proposal,
			signatures: signaturesForProposal,
		});
	}

	const nextPageCursor =
		result.length > 0
			? result[result.length - 1]?.id
			: undefined;

	return paginateResponse(
		result,
		cursor.perPage,
		hasNextPage,
		nextPageCursor?.toString(),
	);
};

export const lookupAndVerifyProposal = async (
	proposal: ProposalWithSignatures,
) => {
	if (proposal.status !== ProposalStatus.PENDING)
		return { verified: true };

	const multisig = await getMultisig(
		proposal.multisigAddress,
	);

	const currentWeight = proposal.signatures.reduce(
		(acc, sig) =>
			acc +
			(multisig.members.find(
				(member) => member.publicKey === sig.publicKey,
			)?.weight ?? 0),
		0,
	);

	if (multisig.threshold > currentWeight)
		throw new ValidationError(
			'Proposal is not ready to execute',
		);

	const tx = await getSuiClient(
		proposal.network as SuiNetwork,
	).getTransactionBlock({
		digest: proposal.digest,
		options: { showEffects: true },
	});

	if (!tx.checkpoint || !tx.effects)
		throw new ValidationError('Transaction not found');

	const isSuccess = tx.effects.status.status === 'success';

	await db
		.update(SchemaProposals)
		.set({
			status: isSuccess
				? ProposalStatus.SUCCESS
				: ProposalStatus.FAILURE,
		})
		.where(eq(SchemaProposals.id, proposal.id));

	return { verified: true };
};
