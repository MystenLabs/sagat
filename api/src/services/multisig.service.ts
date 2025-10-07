import { and, eq, inArray } from 'drizzle-orm';
import {
  ProposalStatus,
  SchemaMultisigMembers,
  SchemaMultisigProposers,
  SchemaMultisigs,
  SchemaProposals,
} from '../db/schema';
import { db } from '../db';
import { ValidationError } from '../errors';
import { Transaction } from '@mysten/sui/transactions';
import { queryAllOwnedObjects, SuiNetwork } from '../utils/client';
import { PublicKey } from '@mysten/sui/cryptography';

// Returns the multisig with its members.
export const getMultisig = async (address: string) => {
  const [result, proposers] = await Promise.all([
    db
      .select()
      .from(SchemaMultisigs)
      .leftJoin(
        SchemaMultisigMembers,
        eq(SchemaMultisigs.address, SchemaMultisigMembers.multisigAddress),
      )
      .where(eq(SchemaMultisigs.address, address)),
    db.query.SchemaMultisigProposers.findMany({
      where: eq(SchemaMultisigProposers.multisigAddress, address),
    }),
  ]);

  if (!result || result.length === 0) {
    throw new ValidationError('Multisig not found');
  }

  const multisig = result[0].multisigs;
  const members = result
    .map((row) => row.multisig_members)
    .filter((row) => !!row);

  return {
    ...multisig,
    members: members.sort((a, b) => a.order - b.order),
    proposers,
  };
};

export const validateQuorum = async (
  addresses: string[],
  weights: number[],
  threshold: number,
) => {
  if (addresses.length !== weights.length) {
    throw new ValidationError('Addresses and weights must be the same length');
  }

  if (addresses.length > 10 || addresses.length < 2) {
    throw new ValidationError(
      'Addresses cannot be more than 10 or less than 2',
    );
  }

  // validate weights.
  weights.forEach((weight) => {
    if (weight <= 0) {
      throw new ValidationError('Weights must be greater than 0');
    }
    if (weight > 255) {
      throw new ValidationError('Weights must be less than 256');
    }
  });

  // prevent duplicates
  const uniqueAddresses = Array.from(new Set(addresses));
  if (uniqueAddresses.length !== addresses.length) {
    throw new ValidationError('Addresses must be unique');
  }

  if (threshold > weights.reduce((acc, weight) => acc + weight, 0)) {
    throw new ValidationError('Threshold must be less than the sum of weights');
  }

  if (threshold < 1) {
    throw new ValidationError('Threshold must be greater or equal to 1');
  }
};

// Returns true if the multisig is finalized (all members have accepted the invitation).
export const isMultisigFinalized = async (address: string, tx?: any) => {
  const query = tx ? tx.query : db.query;
  const isFinalized = await query.SchemaMultisigMembers.findMany({
    where: and(
      eq(SchemaMultisigMembers.multisigAddress, address),
      eq(SchemaMultisigMembers.isAccepted, false),
    ),
  });

  return isFinalized.length === 0;
};

// Returns true if the public key is a member of the multisig and has accepted the invitation.
export const isMultisigMember = async (
  msigAddress: string,
  publicKey: PublicKey,
  checkAcceptance: boolean = true,
) => {
  const whereConditions = [
    eq(SchemaMultisigMembers.multisigAddress, msigAddress),
    eq(SchemaMultisigMembers.publicKey, publicKey.toSuiPublicKey()),
  ];

  if (checkAcceptance) {
    whereConditions.push(eq(SchemaMultisigMembers.isAccepted, true));
  }

  const member = await db.query.SchemaMultisigMembers.findFirst({
    where: and(...whereConditions),
  });
  return !!member;
};

// A convenient checker to see if ANY of the JWT addresses from the header
// have acess to the requested multisig.
export const jwtHasMultisigMemberAccess = async (
  msigAddress: string,
  publicKeys: PublicKey[],
  checkAcceptance: boolean = true,
) => {
  const whereConditions = [
    eq(SchemaMultisigMembers.multisigAddress, msigAddress),
    inArray(
      SchemaMultisigMembers.publicKey,
      publicKeys.map((key) => key.toSuiPublicKey()),
    ),
  ];

  if (checkAcceptance) {
    whereConditions.push(eq(SchemaMultisigMembers.isAccepted, true));
  }

  const member = await db.query.SchemaMultisigMembers.findFirst({
    where: and(...whereConditions),
  });

  return !!member;
};

// Get a list of pending proposals for a given multisig address.
export const getPendingProposals = async (
  multisigAddress: string,
  network: string,
) => {
  const proposals = await db.query.SchemaProposals.findMany({
    where: and(
      eq(SchemaProposals.multisigAddress, multisigAddress),
      eq(SchemaProposals.status, ProposalStatus.PENDING),
      eq(SchemaProposals.network, network),
    ),
  });
  return proposals;
};

// Extracts all the owned or receiving objects from a supplied transaction.
export const extractOwnedObjects = (tx: Transaction) => {
  return [
    ...tx
      .getData()
      .inputs.filter(
        (x) => x.$kind === 'Object' && x.Object.$kind === 'ImmOrOwnedObject',
      )
      .map((x) => x.Object!.ImmOrOwnedObject!.objectId),
    ...(tx.getData().gasData?.payment?.map((x) => x.objectId) || []),
  ];
};

// Validates a proposed transaction.
export const validateProposedTransaction = async (
  proposedTransaction: Transaction,
  multisigAddress: string,
  network: SuiNetwork,
) => {
  // Get the list of pending proposals.
  const pendingProposals = await getPendingProposals(multisigAddress, network);

  if (pendingProposals.length >= 10) {
    throw new ValidationError(
      'You cannot have more than 10 pending proposals at the same time. Please cancel or execute some proposals before proceeding.',
    );
  }

  // Make sure the transaction is fully resolved. We do not currently allow unresolved txs.
  if (!proposedTransaction.isFullyResolved()) {
    throw new ValidationError('The transaction is not fully resolved.');
  }

  //   Fail early on duplicats, avoid doing RPC calls.
  const digest = await proposedTransaction.getDigest();
  if (pendingProposals.some((p) => p.digest === digest)) {
    throw new ValidationError(
      'A proposal with the same digest already exists.',
    );
  }

  if (proposedTransaction.getData().sender !== multisigAddress) {
    throw new ValidationError(
      'The transaction sender does not match the multisig address.',
    );
  }

  // Get all the owned or receiving objects from the pending proposals.
  // Make sure we do not have any of these in our proposal.
  const ownedOrReceivingObjects: string[] = [];
  for (const proposal of pendingProposals) {
    const tx = Transaction.from(proposal.transactionBytes);
    ownedOrReceivingObjects.push(...extractOwnedObjects(tx));
  }

  //   Query all the owned objects.
  const allOwnedObjects = await queryAllOwnedObjects(
    ownedOrReceivingObjects,
    network,
  );

  // Get all the owned or receiving objects from the proposed transaction.
  const existingProposalObjects = extractOwnedObjects(proposedTransaction);
  const allUsedOwnedObjects = [];

  for (const obj of allOwnedObjects) {
    if (existingProposalObjects.includes(obj.objectId)) {
      allUsedOwnedObjects.push(obj);
    }
  }

  if (allUsedOwnedObjects.length > 0) {
    throw new ValidationError(
      'You cannot have re-use any owned or receiving objects that are already in pending proposals. The used objects are: ' +
        allUsedOwnedObjects.map((obj) => obj.objectId).join(', '),
    );
  }
};
