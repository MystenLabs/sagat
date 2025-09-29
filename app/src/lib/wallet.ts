import { PublicKey, SIGNATURE_SCHEME_TO_FLAG } from "@mysten/sui/cryptography";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1PublicKey } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1PublicKey } from "@mysten/sui/keypairs/secp256r1";

// Format the expiry time for the signature message
export function getExpiryTime(): string {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 30); // 30 minutes from now
  return expiry.toISOString();
}

// Create the auth message that needs to be signed
export function createAuthMessage(expiry: string): string {
  return `Verifying address ownership until: ${expiry}`;
}

export function extractPublicKeyFromBase64(publicKey: string): PublicKey {
  try {
    return new Ed25519PublicKey(publicKey);
  } catch (err) {}
  try {
    return new Secp256k1PublicKey(publicKey);
  } catch (err) {}
  try {
    return new Secp256r1PublicKey(publicKey);
  } catch (err) {}
  throw new Error("Invalid public key");
}

export function extractPublicKey(
  publicKey: Uint8Array,
  expectedAddress: string,
): PublicKey {
  const address = new Uint8Array(publicKey);
  const flag = address[0];
  const data = address.slice(1);

  let pubKey: PublicKey;

  switch (flag) {
    case SIGNATURE_SCHEME_TO_FLAG.ED25519:
      pubKey = new Ed25519PublicKey(data);
      break;
    case SIGNATURE_SCHEME_TO_FLAG.Secp256k1:
      pubKey = new Secp256k1PublicKey(data);
      break;
    case SIGNATURE_SCHEME_TO_FLAG.Secp256r1:
      pubKey = new Secp256r1PublicKey(data);
      break;
    default:
      throw new Error("Invalid public key type");
  }

  if (pubKey.toSuiAddress() !== expectedAddress)
    throw new Error("Invalid public key");

  return pubKey;
}
