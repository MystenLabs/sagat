import { Hono } from 'hono';
import {
  MultisigWithMembers,
  SchemaAddresses,
  SchemaMultisigMembers,
  SchemaMultisigs,
} from '../db/schema';
import { db } from '../db';
import { and, eq, inArray } from 'drizzle-orm';
import { authMiddleware, AuthEnv } from '../services/auth.service';
import { Context } from 'hono';
import { ValidationError } from '../errors';
import { parsePublicKey } from '../utils/pubKey';
import { registerPublicKeys } from '../services/addresses.service';

const addressesRouter = new Hono();

/**
 * Register addresses from authenticated JWT context.
 * No signature required - uses JWT authentication.
 */
addressesRouter.post('/', authMiddleware, async (c: Context<AuthEnv>) => {
  const publicKeys = c.get('publicKeys');
  const { extraPublicKeys } = await c.req
    .json()
    .catch(() => ({ extraPublicKeys: [] }));

  // Parse extra public keys using the existing utility
  const parsedExtraKeys = extraPublicKeys
    .map((keyStr: string) => {
      try {
        return parsePublicKey(keyStr);
      } catch (error) {
        console.warn('Failed to parse public key:', keyStr, error);
        return null;
      }
    })
    .filter(Boolean);

  // Combine all public keys
  const allPublicKeys = [...publicKeys, ...parsedExtraKeys];

  // Register all public keys using the service
  await registerPublicKeys(allPublicKeys);

  return c.json({ success: true });
});

// Return a list of all multisigs that the JWT has active.
// Add a `?showPending=true` query to get invitations too.
addressesRouter.get(
  '/connections',
  authMiddleware,
  async (c: Context<AuthEnv>) => {
    const { showPending } = c.req.query();
    const publicKeys = c.get('publicKeys');

    const whereConditions = [
      inArray(
        SchemaMultisigMembers.publicKey,
        publicKeys.map((pubKey) => pubKey.toBase64()),
      ),
    ];

    // Show only accepted by default, show ALL (both accepted and pending) when showPending=true
    if (showPending !== 'true')
      whereConditions.push(eq(SchemaMultisigMembers.isAccepted, true));

    // Get members with their multisig details
    const membersWithMultisig = await db
      .select({
        // Member fields
        multisigAddress: SchemaMultisigMembers.multisigAddress,
        publicKey: SchemaMultisigMembers.publicKey,
        weight: SchemaMultisigMembers.weight,
        isAccepted: SchemaMultisigMembers.isAccepted,
        order: SchemaMultisigMembers.order,
        // Multisig fields
        name: SchemaMultisigs.name,
        threshold: SchemaMultisigs.threshold,
        isVerified: SchemaMultisigs.isVerified,
      })
      .from(SchemaMultisigMembers)
      .innerJoin(
        SchemaMultisigs,
        eq(SchemaMultisigMembers.multisigAddress, SchemaMultisigs.address),
      )
      .where(and(...whereConditions));

    const multisigsWithMembers: MultisigWithMembers[] = [];

    // Group the distinct multiisgs.
    for (const member of membersWithMultisig) {
      if (
        !multisigsWithMembers.some((m) => m.address === member.multisigAddress)
      ) {
        multisigsWithMembers.push({
          members: [],
          // Gather initial
          address: member.multisigAddress,
          isVerified: member.isVerified,
          threshold: member.threshold,
          name: member.name,
          totalMembers: 0,
          totalWeight: 0,
        });
      }

      // Safe, we just added it.
      const msig = multisigsWithMembers.find(
        (m) => m.address === member.multisigAddress,
      )!;

      // avoid duplicates.
      if (msig.members.some((m) => m.publicKey === member.publicKey)) continue;

      // Add to members.
      msig.members.push({
        multisigAddress: member.multisigAddress,
        publicKey: member.publicKey,
        weight: member.weight,
        isAccepted: member.isAccepted,
        order: member.order,
      });
    }

    // Keep the members ordered by order to keep compositions composable.
    for (const msig of multisigsWithMembers) {
      msig.members = msig.members.sort((a, b) => a.order - b.order);
      msig.totalMembers = msig.members.length;
      msig.totalWeight = msig.members.reduce((acc, m) => acc + m.weight, 0);
    }

    const grouped: Record<string, MultisigWithMembers[]> = {};

    for (const pubkey of publicKeys) {
      const pubKeyBase64 = pubkey.toBase64();
      // shouldnt really happen
      if (grouped[pubKeyBase64]) continue;

      grouped[pubKeyBase64] = multisigsWithMembers.filter((m) =>
        m.members.some((m) => m.publicKey === pubKeyBase64),
      );
    }

    return c.json(grouped);
  },
);

// Get the public key for an address registered in the system.
addressesRouter.get('/:address', async (c) => {
  const { address } = c.req.param();

  const addr = await db.query.SchemaAddresses.findFirst({
    where: eq(SchemaAddresses.address, address),
  });

  if (!addr)
    throw new ValidationError('Address is not registered in the system.');

  return c.json(addr);
});

export default addressesRouter;
