import { and, desc, eq, inArray, lt, lte } from 'drizzle-orm';
import { db } from '../db';
import {
  ProposalStatus,
  ProposalWithSignatures,
  SchemaProposals,
  SchemaProposalSignatures,
} from '../db/schema';
import { ValidationError } from '../errors';
import { paginateResponse, PaginationCursor } from '../utils/pagination';
// Get a proposal by id, and its signatures.
export const getProposalById = async (proposalId: number) => {
  const result = await db
    .select()
    .from(SchemaProposals)
    .leftJoin(
      SchemaProposalSignatures,
      eq(SchemaProposals.id, SchemaProposalSignatures.proposalId),
    )
    .where(eq(SchemaProposals.id, proposalId));

  if (!result || result.length === 0)
    throw new ValidationError('Proposal not found');

  const proposal = result[0].proposals;
  const signatures = result
    .filter((row) => row.proposal_signatures !== null)
    .map((row) => row.proposal_signatures);

  return {
    ...proposal,
    signatures,
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
  const proposals = await db.query.SchemaProposals.findMany({
    where: and(
      eq(SchemaProposals.multisigAddress, multisigAddress),
      status ? eq(SchemaProposals.status, status) : undefined,
      eq(SchemaProposals.network, network),
      nextCursor ? lt(SchemaProposals.id, nextCursor) : undefined,
    ),
    limit: cursor?.perPage + 1,
    orderBy: [desc(SchemaProposals.id)],
  });
  // If we have more results than our page size, we have a next page.
  const hasNextPage = proposals.length > cursor.perPage;

  const page = proposals.slice(0, cursor.perPage);

  // Get the list of signatures for each one of those.
  const signatures = await db.query.SchemaProposalSignatures.findMany({
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
    result.length > 0 ? result[result.length - 1]?.id : undefined;

  return paginateResponse(
    result,
    cursor.perPage,
    hasNextPage,
    nextPageCursor?.toString(),
  );
};
