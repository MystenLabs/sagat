import { Hono } from 'hono';
import {
  MultisigWithMembers,
  SchemaAddresses,
  SchemaMultisigMembers,
} from '../db/schema';
import { db } from '../db';
import { and, eq, inArray } from 'drizzle-orm';
import { authMiddleware, AuthEnv } from '../services/auth.service';
import { Context } from 'hono';
import { ValidationError } from '../errors';
import { parsePublicKey } from '../utils/pubKey';
import {
  registerPublicKeys,
  expandMultisigsWithMembers,
} from '../services/addresses.service';

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

// Return a list of all accepted multisigs that the JWT has active.
addressesRouter.get(
  '/connections',
  authMiddleware,
  async (c: Context<AuthEnv>) => {
    const publicKeys = c.get('publicKeys');

    const whereConditions = [
      inArray(
        SchemaMultisigMembers.publicKey,
        publicKeys.map((pubKey) => pubKey.toBase64()),
      ),
      eq(SchemaMultisigMembers.isAccepted, true),
      eq(SchemaMultisigMembers.isRejected, false),
    ];

    // Step 1: Find multisig addresses that the given publicKeys belong to
    const multisigAddresses = await db
      .selectDistinct({
        address: SchemaMultisigMembers.multisigAddress,
      })
      .from(SchemaMultisigMembers)
      .where(and(...whereConditions.filter((x) => !!x)));

    // Step 2: Expand multisigs to full objects with all members
    const multisigsWithMembers = await expandMultisigsWithMembers(
      multisigAddresses.map((m) => m.address),
    );

    const grouped: Record<string, MultisigWithMembers[]> = {};

    for (const pubkey of publicKeys) {
      const pubKeyBase64 = pubkey.toBase64();
      // shouldnt really happen
      if (grouped[pubKeyBase64]) continue;

      // Only include accepted multisigs for individual public keys.
      grouped[pubKeyBase64] = multisigsWithMembers.filter((m) =>
        m.members.some((m) => m.publicKey === pubKeyBase64 && m.isAccepted),
      );
    }

    return c.json(grouped);
  },
);

// Get invitations for a specific public key
addressesRouter.get(
  '/invitations/:publicKey',
  authMiddleware,
  async (c: Context<AuthEnv>) => {
    const publicKeys = c.get('publicKeys');
    const { showRejected } = c.req.query();
    const { publicKey } = c.req.param();

    if (!publicKeys.some((pubKey) => pubKey.toBase64() === publicKey))
      throw new ValidationError('You are not authorized.');

    const whereConditions = [
      eq(SchemaMultisigMembers.publicKey, publicKey),
      showRejected === 'true'
        ? eq(SchemaMultisigMembers.isRejected, true)
        : and(
            eq(SchemaMultisigMembers.isAccepted, false),
            eq(SchemaMultisigMembers.isRejected, false),
          ),
    ];

    // Step 1: Find multisig addresses for this public key's invitations
    const multisigAddresses = await db
      .selectDistinct({
        address: SchemaMultisigMembers.multisigAddress,
      })
      .from(SchemaMultisigMembers)
      .where(and(...whereConditions.filter((x) => !!x)));

    // Step 2: Expand multisigs to full objects with all members
    const multisigsWithMembers = await expandMultisigsWithMembers(
      multisigAddresses.map((m) => m.address),
    );

    return c.json(multisigsWithMembers);
  },
);

// Get the public key for an address registered in the system.
// IMPORTANT: Keep this route last as it's a catch-all for any /:address pattern
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
