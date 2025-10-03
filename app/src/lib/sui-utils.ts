import { PublicKey } from "@mysten/sui/cryptography";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1PublicKey } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1PublicKey } from "@mysten/sui/keypairs/secp256r1";
import { MultiSigPublicKey } from "@mysten/sui/multisig";

const publicKeyFromBase64String = (publicKeyString: string): PublicKey => {
  try {
    return new Ed25519PublicKey(publicKeyString);
  } catch (e) {}
  try {
    return new Secp256k1PublicKey(publicKeyString);
  } catch (e) {}
  try {
    return new Secp256r1PublicKey(publicKeyString);
  } catch (e) {}
  throw new Error("Invalid public key");
};

/**
 * Validates and parses a public key string
 */
export function validatePublicKey(publicKeyString: string): {
  isValid: boolean;
  address?: string;
  error?: string;
} {
  try {
    const pubKey = publicKeyFromBase64String(publicKeyString);
    return {
      isValid: true,
      address: pubKey.toSuiAddress(),
    };
  } catch (e) {
    return {
      isValid: false,
      error: "Invalid public key",
    };
  }
}

/**
 * Computes the multisig address from public keys and threshold
 */
export function computeMultisigAddress(
  publicKeys: string[],
  weights: number[],
  threshold: number,
): { address: string | null; error: string | null } {
  try {
    if (publicKeys.length === 0) {
      return { address: null, error: "No public keys provided" };
    }

    // Filter out empty public keys
    const validKeys = publicKeys.filter(Boolean);

    if (validKeys.length !== publicKeys.length) {
      return { address: null, error: "Cannot compute multisig address. Some public keys are empty" };
    }

    // Convert public key strings to PublicKey objects
    const pubKeys = validKeys.map((keyStr) => {
      const validation = validatePublicKey(keyStr);
      if (!validation.isValid)
        throw new Error(`Failed to compute multisig address. Invalid public key: ${validation.error}`);

      return publicKeyFromBase64String(keyStr);
    });

    // Create multisig public key
    const multisig = MultiSigPublicKey.fromPublicKeys({
      threshold,
      publicKeys: pubKeys.map((key, index) => ({
        publicKey: key,
        weight: weights[index],
      })),
    });

    return { address: multisig.toSuiAddress(), error: null };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unreachable threshold') {
        return { address: null, error: "The threshold is unreachable for the provided weights. Please adjust the threshold or add more members." };
      }
    }
    return {
      address: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
