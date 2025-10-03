import React, { createContext, useContext, useEffect } from "react";
import { useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/api";
import { Address, AuthCheckResponse } from "../lib/types";
import { getExpiryTime, createAuthMessage } from "../lib/wallet";
import { toast } from "sonner";
import { QueryKeys } from "../lib/queryKeys";
import { parseSerializedSignature, PublicKey } from "@mysten/sui/cryptography";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1PublicKey } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1PublicKey } from "@mysten/sui/keypairs/secp256r1";

interface ApiAuthContextType {
  // Auth state from API
  isAuthenticated: boolean;
  authenticatedAddresses: string[];
  isCheckingAuth: boolean;

  // Current wallet account state
  currentAddress: Address | null;
  isCurrentAddressAuthenticated: boolean;

  // Actions
  signAndConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  isConnecting: boolean;
  isDisconnecting: boolean;
}

const ApiAuthContext = createContext<ApiAuthContextType | undefined>(undefined);

const AUTH_QUERY_KEY = ["auth", "check"] as const;

export function ApiAuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // Get current account from dApp Kit
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  // Check auth status with API whenever wallet changes
  const {
    data: authData,
    isLoading: isCheckingAuth,
    refetch: refetchAuth,
  } = useQuery<AuthCheckResponse>({
    queryKey: [...AUTH_QUERY_KEY, currentAccount?.address],
    queryFn: () => apiClient.checkAuth(),
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
    // Always check when account changes
    enabled: true,
  });

  // Re-check auth when wallet account changes
  useEffect(() => {
    refetchAuth();
  }, [currentAccount?.address, refetchAuth]);

  // Connect mutation - signs message and sends to API
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!currentAccount) {
        throw new Error("No wallet connected");
      }

      const expiry = getExpiryTime();
      const message = createAuthMessage(expiry);

      // Sign with current account
      const signResult = await signPersonalMessage({
        message: new TextEncoder().encode(message),
        account: currentAccount,
      });

      const analyzeSignature = await parseSerializedSignature(
        signResult.signature,
      );

      let pubKey: PublicKey;

      if (analyzeSignature.signatureScheme === "ED25519") {
        pubKey = new Ed25519PublicKey(analyzeSignature.publicKey);
      } else if (analyzeSignature.signatureScheme === "Secp256k1") {
        pubKey = new Secp256k1PublicKey(analyzeSignature.publicKey);
      } else if (analyzeSignature.signatureScheme === "Secp256r1") {
        pubKey = new Secp256r1PublicKey(analyzeSignature.publicKey);
      } else {
        throw new Error(
          "Unsupported signature scheme. Only ED25519, Secp256k1, and Secp256r1 are supported.",
        );
      }

      // Send to API
      return apiClient.connect({
        publicKey: pubKey.toSuiPublicKey(),
        signature: signResult.signature,
        expiry,
      });
    },
    onSuccess: async () => {
      await refetchAuth();
      await queryClient.invalidateQueries({ queryKey: [QueryKeys.Multisigs] });
      await queryClient.invalidateQueries({ queryKey: [QueryKeys.Proposals] });
      toast.success("Successfully authenticated");
    },
    onError: (error: Error) => {
      toast.error(`Authentication failed: ${error.message}`);
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: () => apiClient.disconnect(),
    onSuccess: async () => {
      queryClient.clear();
      await refetchAuth();
      toast.success("Disconnected");
    },
    onError: (error: Error) => {
      toast.error(`Disconnect failed: ${error.message}`);
    },
  });

  const currentAddress =
    authData?.addresses?.find((x) => x.address === currentAccount?.address) ||
    null;

  const isCurrentAddressAuthenticated =
    !!currentAddress &&
    (authData?.addresses?.some((x) => x.address === currentAddress.address) ??
      false);

  const value: ApiAuthContextType = {
    // Auth state
    isAuthenticated: authData?.authenticated ?? false,
    authenticatedAddresses: authData?.addresses?.map((x) => x.address) ?? [],
    isCheckingAuth,

    // Current wallet
    currentAddress,
    isCurrentAddressAuthenticated,

    // Actions
    signAndConnect: async () => {
      await connectMutation.mutateAsync();
    },
    disconnect: async () => {
      await disconnectMutation.mutateAsync();
    },
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
  };

  return (
    <ApiAuthContext.Provider value={value}>{children}</ApiAuthContext.Provider>
  );
}

export function useApiAuth() {
  const context = useContext(ApiAuthContext);
  if (!context) {
    throw new Error("useApiAuth must be used within ApiAuthProvider");
  }
  return context;
}
