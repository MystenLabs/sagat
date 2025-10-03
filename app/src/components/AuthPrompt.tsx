import { useCurrentAccount } from "@mysten/dapp-kit";
import { useApiAuth } from "../contexts/ApiAuthContext";
import { Button } from "./ui/button";
import { CopyButton } from "./ui/CopyButton";
import { Shield, ArrowRight } from "lucide-react";
import { formatAddress } from "../lib/formatters";

export function AuthPrompt() {
  const currentAccount = useCurrentAccount();
  const { signAndConnect, isConnecting } = useApiAuth();

  return (
    <div className="mx-auto mt-20 p-8">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-6">
          <Shield className="w-10 h-10 text-blue-600" />
        </div>

        <h1 className="text-3xl font-bold mb-3">Authenticate Your Wallet</h1>

        <p className="text-gray-600 mb-8">
          Sign a message to securely connect your wallet to Sagat
        </p>

        <div className="bg-gray-50 rounded-lg p-6 mb-8 space-y-3 max-w-lg mx-auto">
          <div>
            <p className="text-xs text-gray-500 mb-1">Address</p>
            <div className="flex items-center justify-center gap-1">
              <p className="font-mono text-sm font-medium">
                {currentAccount ? formatAddress(currentAccount.address) : ""}
              </p>
              {currentAccount && (
                <CopyButton value={currentAccount.address} size="xs" />
              )}
            </div>
          </div>
        </div>

        <Button
          onClick={signAndConnect}
          disabled={isConnecting}
          size="lg"
          className="w-full"
        >
          {isConnecting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Signing message...
            </>
          ) : (
            <>
              Sign Message to Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <p className="text-xs text-gray-500 mt-4">
          This creates a secure session between your wallet and our service. No
          transactions will be sent.
        </p>
      </div>
    </div>
  );
}
