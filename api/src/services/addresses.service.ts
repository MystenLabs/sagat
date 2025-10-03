import { ValidationError } from '../errors';
import { parsePublicKey } from '../utils/pubKey';
import { db } from '../db';
import {
  SchemaAddresses,
  SchemaMultisigMembers,
  SchemaMultisigs,
  MultisigWithMembers,
} from '../db/schema';
import { type PublicKey } from '@mysten/sui/cryptography';
import { eq, inArray } from 'drizzle-orm';

// Takes a pub key, a signature, and a message, and validates it.
// Returns the Sui address if valid, or null if not.
export const validatePersonalMessage = async (
  publicKey: PublicKey,
  signature: string,
  message: string,
) => {
  const isValid = await publicKey.verifyPersonalMessage(
    new TextEncoder().encode(message),
    signature,
  );

  if (!isValid) {
    throw new ValidationError('Invalid signature for message');
  }
};

/**
 * Registers a single public key in the addresses table
 */
export async function registerPublicKey(publicKey: PublicKey): Promise<void> {
  await db
    .insert(SchemaAddresses)
    .values({
      publicKey: publicKey.toSuiPublicKey(),
      address: publicKey.toSuiAddress(),
    })
    .onConflictDoNothing();
}

/**
 * Registers multiple public keys in the addresses table
 */
export async function registerPublicKeys(
  publicKeys: PublicKey[],
): Promise<void> {
  if (publicKeys.length === 0) return;

  const addressData = publicKeys.map((pubKey) => ({
    publicKey: pubKey.toSuiPublicKey(),
    address: pubKey.toSuiAddress(),
  }));

  await db.insert(SchemaAddresses).values(addressData).onConflictDoNothing();
}

/**
 * Registers public keys from base64 strings
 */
export async function registerPublicKeyStrings(
  publicKeyStrings: string[],
): Promise<void> {
  if (publicKeyStrings.length === 0) return;

  const publicKeys = publicKeyStrings.map((keyStr) => parsePublicKey(keyStr));
  await registerPublicKeys(publicKeys);
}

/**
 * Expands multisig addresses to full MultisigWithMembers objects
 * Takes an array of multisig addresses and returns complete multisig data with all members
 */
export async function expandMultisigsWithMembers(
  multisigAddresses: string[],
): Promise<MultisigWithMembers[]> {
  if (multisigAddresses.length === 0) return [];

  // Fetch ALL members belonging to those multisigs with multisig data
  const membersWithMultisig = await db
    .select({
      multisigAddress: SchemaMultisigMembers.multisigAddress,
      publicKey: SchemaMultisigMembers.publicKey,
      weight: SchemaMultisigMembers.weight,
      isAccepted: SchemaMultisigMembers.isAccepted,
      order: SchemaMultisigMembers.order,
      isRejected: SchemaMultisigMembers.isRejected,
      name: SchemaMultisigs.name,
      threshold: SchemaMultisigs.threshold,
      isVerified: SchemaMultisigs.isVerified,
    })
    .from(SchemaMultisigMembers)
    .innerJoin(
      SchemaMultisigs,
      eq(SchemaMultisigMembers.multisigAddress, SchemaMultisigs.address),
    )
    .where(inArray(SchemaMultisigMembers.multisigAddress, multisigAddresses));

  const multisigsWithMembers: MultisigWithMembers[] = [];

  // Group the distinct multisigs
  for (const member of membersWithMultisig) {
    if (
      !multisigsWithMembers.some((m) => m.address === member.multisigAddress)
    ) {
      multisigsWithMembers.push({
        address: member.multisigAddress,
        isVerified: member.isVerified,
        threshold: member.threshold,
        name: member.name,
        totalMembers: 0,
        totalWeight: 0,
        members: [],
      });
    }

    const msig = multisigsWithMembers.find(
      (m) => m.address === member.multisigAddress,
    )!;

    // avoid duplicates
    if (msig.members.some((m) => m.publicKey === member.publicKey)) continue;

    msig.members.push({
      multisigAddress: member.multisigAddress,
      publicKey: member.publicKey,
      weight: member.weight,
      isAccepted: member.isAccepted,
      order: member.order,
      isRejected: member.isRejected,
    });
  }

  // Keep members ordered and calculate totals
  for (const msig of multisigsWithMembers) {
    msig.members = msig.members.sort((a, b) => a.order - b.order);
    msig.totalMembers = msig.members.length;
    msig.totalWeight = msig.members.reduce((acc, m) => acc + m.weight, 0);
  }

  return multisigsWithMembers;
}
