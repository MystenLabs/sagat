import {
  PublicKey,
  SIGNATURE_FLAG_TO_SCHEME,
  SIGNATURE_SCHEME_TO_FLAG,
  SIGNATURE_SCHEME_TO_SIZE,
} from '@mysten/sui/cryptography';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1PublicKey } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1PublicKey } from '@mysten/sui/keypairs/secp256r1';
import { ValidationError } from '../errors';
import { fromBase64 } from '@mysten/sui/utils';

export const parsePublicKey = (publicKey: string): PublicKey => {
  const bytes = fromBase64(publicKey);

  // if bytes length === 33, we only accept ed25519 ones.
  if (bytes.length === SIGNATURE_SCHEME_TO_SIZE.ED25519 + 1) {
    const flag = bytes[0];
    const data = bytes.slice(1);

    if (flag !== SIGNATURE_SCHEME_TO_FLAG.ED25519)
      throw new ValidationError(
        'Public keys must have a sui flag. You can export them using `toSuiPublicKey()` instead of `toBase64()`.',
      );

    return new Ed25519PublicKey(data);
  }

  // For length === 34, we know it's either secp256k1, or secp256r1
  if (bytes.length === SIGNATURE_SCHEME_TO_SIZE.Secp256k1 + 1) {
    const flag = bytes[0];
    const data = bytes.slice(1);

    if (flag === SIGNATURE_SCHEME_TO_FLAG.Secp256k1)
      return new Secp256k1PublicKey(data);
    if (flag === SIGNATURE_SCHEME_TO_FLAG.Secp256r1)
      return new Secp256r1PublicKey(data);
  }

  throw new ValidationError(
    'Only ED25519, Secp256k1, and Secp256r1 are supported. Also, public keys must have a sui flag. You can export them using `toSuiPublicKey()` instead of `toBase64()`.',
  );
};
