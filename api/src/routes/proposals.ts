import { Transaction } from '@mysten/sui/transactions';
import { Context, Hono } from 'hono';
import {
  getMultisig,
  isMultisigMember,
  jwtHasMultisigMemberAccess,
  validateProposedTransaction,
} from '../services/multisig.service';
import { ValidationError } from '../errors';
import {
  ProposalStatus,
  proposalStatusFromString,
  SchemaProposals,
  SchemaProposalSignatures,
} from '../db/schema';
import { db } from '../db';
import { parsePublicKey } from '../utils/pubKey';
import { fromBase64 } from '@mysten/sui/utils';
import {
  getProposalById,
  getProposalsByMultisigAddress,
} from '../services/proposals.service';
import { eq } from 'drizzle-orm';
import { AuthEnv, authMiddleware } from '../services/auth.service';
import { getSuiClient, SuiNetwork } from '../utils/client';
import { validateNetwork } from '../db/env';
import { validatePersonalMessage } from '../services/addresses.service';

const proposalsRouter = new Hono();

// Create a new proposed multi-sig transaction.
proposalsRouter.post('/', async (c) => {
  const {
    multisigAddress,
    transactionBytes,
    publicKey,
    signature,
    description,
    network,
  } = await c.req.json();

  validateNetwork(network);

  const pubKey = parsePublicKey(publicKey);

  if (!(await isMultisigMember(multisigAddress, pubKey)))
    throw new ValidationError('Proposer is not a member of the multisig');

  const proposedTransaction = Transaction.from(transactionBytes);

  // Validate the proposed transaction for:
  // 1. No other pending proposal with the same owned objects in them.
  // 2. The transaction is fully resolved.
  // 3. The transaction is not already in a pending proposal.
  await validateProposedTransaction(
    proposedTransaction,
    multisigAddress,
    network,
  );

  // Build the transaction to verify the supplied user signature
  const built = await proposedTransaction.build({
    client: getSuiClient(network),
  });

  // Verify the supplied user signature.

  const isValidSuiSignature = await pubKey.verifyTransaction(built, signature);

  if (!isValidSuiSignature)
    throw new ValidationError(
      'Invalid Sui signature for the proposed transaction.',
    );

  // Insert the proposal and the first sig!
  const proposal = await db.transaction(async (tx) => {
    const proposal = await tx
      .insert(SchemaProposals)
      .values({
        multisigAddress,
        digest: await proposedTransaction.getDigest(),
        transactionBytes,
        builtTransactionBytes: built.toBase64(),
        proposerAddress: pubKey.toSuiAddress(),
        description,
        network,
      })
      .returning();

    await tx.insert(SchemaProposalSignatures).values({
      proposalId: proposal[0].id,
      publicKey,
      signature,
    });

    return proposal[0];
  });

  return c.json(proposal);
});
// Adds a signature for the transaction.
proposalsRouter.post('/:proposalId/vote', async (c) => {
  const { publicKey, signature } = await c.req.json();
  const { proposalId } = c.req.param();

  const proposal = await getProposalById(parseInt(proposalId));

  const pubKey = parsePublicKey(publicKey);

  if (!(await isMultisigMember(proposal.multisigAddress, pubKey)))
    throw new ValidationError('Voter is not a member of the multisig');

  if (proposal.status !== ProposalStatus.PENDING)
    throw new ValidationError('Proposal is not pending');

  if (proposal.signatures.some((sig) => sig?.publicKey === publicKey))
    throw new ValidationError('Voter has already voted for this proposal');

  const isValidSuiSignature = await pubKey.verifyTransaction(
    fromBase64(proposal.builtTransactionBytes),
    signature,
  );

  if (!isValidSuiSignature)
    throw new ValidationError(
      'Invalid Sui signature for the proposed transaction.',
    );

  const signatureObject = {
    proposalId: proposal.id,
    publicKey,
    signature,
  };

  // cast the vote in the DB.
  await db.insert(SchemaProposalSignatures).values(signatureObject);
  proposal.signatures.push(signatureObject);

  const multisig = await getMultisig(proposal.multisigAddress);
  let totalVotes = 0;

  for (const sig of proposal.signatures) {
    totalVotes +=
      multisig.members.find((member) => member?.publicKey === sig?.publicKey)
        ?.weight || 0;
  }

  return c.json({ hasReachedThreshold: totalVotes >= multisig.threshold });
});

// Cancel a transaction as a valid member of the commitee.
// TODO: this is pretty powerful (but probably safe to do).
proposalsRouter.post('/:proposalId/cancel', async (c) => {
  const { proposalId } = c.req.param();
  const { publicKey, signature } = await c.req.json();

  const proposal = await getProposalById(parseInt(proposalId));

  if (proposal.status !== ProposalStatus.PENDING)
    throw new ValidationError('Proposal is not pending');

  const pubKey = parsePublicKey(publicKey);

  if (!(await isMultisigMember(proposal.multisigAddress, pubKey)))
    throw new ValidationError('Not a member of the multisig');

  await validatePersonalMessage(
    pubKey,
    signature,
    `Cancel proposal ${proposalId}`,
  );

  await db
    .update(SchemaProposals)
    .set({ status: ProposalStatus.CANCELLED })
    .where(eq(SchemaProposals.id, proposal.id));

  return c.json({ message: 'Proposal cancelled successfully' });
});

// Verify the execution of a proposal.
proposalsRouter.post(
  '/:proposalId/verify',
  authMiddleware,
  async (c: Context<AuthEnv>) => {
    const publicKeys = c.get('publicKeys');
    const { proposalId } = c.req.param();
    const proposal = await getProposalById(parseInt(proposalId));

    if (
      !(await jwtHasMultisigMemberAccess(proposal.multisigAddress, publicKeys))
    )
      throw new ValidationError('Not a member of the multisig');

    if (proposal.status !== ProposalStatus.PENDING)
      return c.json({ verified: true });

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
        status: isSuccess ? ProposalStatus.SUCCESS : ProposalStatus.FAILURE,
      })
      .where(eq(SchemaProposals.id, proposal.id));

    return c.json({ verified: true });
  },
);

proposalsRouter.get('/', authMiddleware, async (c: Context<AuthEnv>) => {
  const publicKeys = c.get('publicKeys');
  const { multisigAddress, status, network } = c.req.query();
  validateNetwork(network);

  if (!(await jwtHasMultisigMemberAccess(multisigAddress, publicKeys)))
    throw new ValidationError('Not a member of the multisig');

  const proposals = await getProposalsByMultisigAddress(
    multisigAddress,
    network,
    status ? proposalStatusFromString(status) : undefined,
  );

  return c.json(proposals);
});

export default proposalsRouter;
