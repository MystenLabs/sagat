import { Hono } from 'hono';
import { SchemaMultisigMembers, SchemaMultisigs } from '../db/schema';
import { parsePublicKey } from '../utils/pubKey';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import {
  getMultisig,
  isMultisigFinalized,
  isMultisigMember,
  jwtHasMultisigMemberAccess,
  validateQuorum,
} from '../services/multisig.service';
import {
  validatePersonalMessage,
  registerPublicKeyStrings,
} from '../services/addresses.service';
import { PublicKey } from '@mysten/sui/cryptography';
import { ValidationError } from '../errors';
import { authMiddleware, AuthEnv } from '../services/auth.service';
import { Context } from 'hono';

const MAX_MULTISIGS_PER_PUBLIC_KEY = 50;

const multisigRouter = new Hono();

// Get multisig details by address (authenticated)
multisigRouter.get('/:address', authMiddleware, async (c: Context<AuthEnv>) => {
  const { address } = c.req.param();
  const publicKeys = c.get('publicKeys');

  // Verify the authenticated user is a member of this multisig
  const hasAccess = await jwtHasMultisigMemberAccess(
    address,
    publicKeys,
    false,
  );

  if (!hasAccess) {
    return c.json(
      { error: 'Access denied. You are not a member of this multisig.' },
      403,
    );
  }

  const multisig = await getMultisig(address);
  return c.json(multisig);
});

multisigRouter.post('/', async (c) => {
  const {
    publicKey,
    publicKeys,
    weights,
    threshold,
    name,
  }: {
    publicKey: string;
    publicKeys: string[];
    weights: number[];
    threshold: number;
    name?: string;
  } = await c.req.json();

  const creatorPubKey = parsePublicKey(publicKey);

  // Register all public keys first
  await registerPublicKeyStrings(publicKeys);

  // Parse all public keys and get their addresses
  const parsedPubKeys: PublicKey[] = [];
  const addresses: string[] = [];

  for (const pubKeyStr of publicKeys) {
    const parsedKey = parsePublicKey(pubKeyStr);
    const address = parsedKey.toSuiAddress();

    parsedPubKeys.push(parsedKey);
    addresses.push(address);
  }

  // Validate the quorum with computed addresses
  await validateQuorum(addresses, weights, threshold);

  if (!addresses.some((address) => address === creatorPubKey.toSuiAddress())) {
    return c.json(
      { error: 'Creator address is not in the list of public keys' },
      400,
    );
  }

  const multisig = MultiSigPublicKey.fromPublicKeys({
    threshold,
    publicKeys: parsedPubKeys.map((key, index) => ({
      publicKey: key,
      weight: weights[index],
    })),
  });

  // add the multisig to the database.
  const database = await db.transaction(async (tx) => {
    const msig = (
      await tx
        .insert(SchemaMultisigs)
        .values({
          address: multisig.toSuiAddress(),
          isVerified: false,
          threshold,
          name,
        })
        .returning()
    )[0];

    // insert the multisig members in the DB.
    const members = await tx
      .insert(SchemaMultisigMembers)
      .values(
        parsedPubKeys.map((key, index) => ({
          multisigAddress: msig.address,
          publicKey: key.toSuiPublicKey(),
          weight:
            weights[addresses.findIndex((addr) => addr === key.toSuiAddress())],
          isAccepted: key.toSuiAddress() === creatorPubKey.toSuiAddress(),
          order: index,
        })),
      )
      .returning();

    return {
      multisig: msig,
      members,
    };
  });

  return c.json(database);
});

// Accept participation in a multisig scheme as a public key holder.
multisigRouter.post('/:address/accept', async (c) => {
  const { publicKey, signature } = await c.req.json();
  const { address } = c.req.param();

  const pubKey = parsePublicKey(publicKey);

  if (!(await isMultisigMember(address, pubKey, false)))
    throw new ValidationError('You are not a member of this multisig');

  await validatePersonalMessage(
    parsePublicKey(publicKey),
    signature,
    `Participating in multisig ${address}`,
  );

  const existingConnections = await db.query.SchemaMultisigMembers.findMany({
    where: and(
      eq(SchemaMultisigMembers.publicKey, pubKey.toSuiPublicKey()),
      eq(SchemaMultisigMembers.isAccepted, true),
    ),
  });

  // Maximum connections per public key.
  if (existingConnections.length > MAX_MULTISIGS_PER_PUBLIC_KEY)
    throw new ValidationError(
      'You have reached the maximum number of multisigs for this public key',
    );

  const result = await db.transaction(async (tx) => {
    const msig = await tx.query.SchemaMultisigs.findFirst({
      where: eq(SchemaMultisigs.address, address),
    });

    if (!msig) throw new ValidationError('Multisig not found');

    await tx
      .update(SchemaMultisigMembers)
      .set({ isAccepted: true, isRejected: false })
      .where(
        and(
          eq(SchemaMultisigMembers.multisigAddress, address),
          eq(SchemaMultisigMembers.publicKey, pubKey.toSuiPublicKey()),
        ),
      );

    const isFinalized = await isMultisigFinalized(address, tx);
    // if all members have accepted, we can finalize the multisig.
    if (isFinalized) {
      await tx
        .update(SchemaMultisigs)
        .set({ isVerified: true })
        .where(eq(SchemaMultisigs.address, address));
    }
    msig.isVerified = isFinalized;
    return msig;
  });

  return c.json(result);
});

// Reject participation in a multisig scheme
multisigRouter.post('/:address/reject', async (c) => {
  const { publicKey, signature } = await c.req.json();
  const { address } = c.req.param();

  // Validate signature with rejection-specific message
  await validatePersonalMessage(
    parsePublicKey(publicKey),
    signature,
    `Rejecting multisig invitation ${address}`,
  );

  const multisig = await getMultisig(address);

  if (multisig.isVerified)
    throw new ValidationError('Multisig is already verified');

  const member = multisig.members.find((x) => x?.publicKey == publicKey);
  if (!member)
    throw new ValidationError('You are not a member of this multisig');

  if (member.isAccepted)
    throw new ValidationError('Cannot reject after accepting');

  if (member.isRejected)
    throw new ValidationError('This invitation has already been rejected');

  await db
    .update(SchemaMultisigMembers)
    .set({ isRejected: true })
    .where(
      and(
        eq(SchemaMultisigMembers.multisigAddress, address),
        eq(SchemaMultisigMembers.publicKey, publicKey),
      ),
    );

  return c.json({
    message: 'Multisig invitation rejected and removed',
    address,
  });
});

export default multisigRouter;
