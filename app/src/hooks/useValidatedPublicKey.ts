import { extractPublicKey } from "@/lib/wallet";
import { useMemo } from "react";
import { WalletAccount } from "@mysten/wallet-standard";

export function useValidatedPublicKey(currentAccount: WalletAccount | null) {
  const { publicKey, error: publicKeyError } = useMemo(() => {
    if (!currentAccount) return { publicKey: null, error: null };

    try {
      const pubKey = extractPublicKey(
        new Uint8Array(currentAccount.publicKey),
        currentAccount.address,
      );

      return { publicKey: pubKey, error: null };
    } catch (error) {
      console.error("Failed to extract public key:", error);
      return {
        publicKey: null,
        error:
          error instanceof Error
            ? error.message
            : "Failed to extract public key",
      };
    }
  }, [currentAccount]);

  return { publicKey, publicKeyError };
}
