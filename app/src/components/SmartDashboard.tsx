import { Link, Navigate } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useUserMultisigs } from "../hooks/useUserMultisigs";
import { useInvitations } from "../hooks/useInvitations";
import { Plus, Mail } from "lucide-react";
import { Button } from "./ui/button";
import { Loading } from "./ui/loading";

export function SmartDashboard() {
  const { data: multisigs, isLoading } = useUserMultisigs(); // Only accepted multisigs
  const { data: pendingInvites } = useInvitations(); // Pending invitations
  const currentAccount = useCurrentAccount();

  if (isLoading) return <Loading message="Loading your multisigs..." />;

  // Case 1: User has active multisigs - smart redirect
  if (multisigs?.length && multisigs.length > 0) {
    // Check if there's a last viewed multisig for this wallet address
    const walletAddress = currentAccount?.address;
    const lastViewedKey = walletAddress
      ? `lastViewedMultisig_${walletAddress}`
      : null;
    const lastViewedMultisig = lastViewedKey
      ? localStorage.getItem(lastViewedKey)
      : null;

    if (lastViewedMultisig) {
      // Check if this multisig still belongs to the current address
      const isValidMultisig = multisigs?.some(
        (m) => m.address === lastViewedMultisig,
      );
      if (isValidMultisig) {
        return (
          <Navigate to={`/multisig/${lastViewedMultisig}/proposals`} replace />
        );
      }
    }

    // Default: redirect to first available multisig
    return (
      <Navigate to={`/multisig/${multisigs?.[0].address}/proposals`} replace />
    );
  }

  // Case 2: User has no active multisigs - show welcome screen
  return (
    <div className="max-w-4xl mx-auto mt-10 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Welcome to Sagat</h1>
        <p className="text-xl text-gray-600 mb-8">
          Get started by creating your first multisig
        </p>

        {/* Primary CTA - Create Multisig */}
        <Link to="/create">
          <Button size="lg" className="px-8">
            <Plus className="mr-2 h-5 w-5" />
            Create Your First Multisig
          </Button>
        </Link>

        {/* Secondary CTA - View Invitations */}
        <div className="mt-4">
          <Link to="/invitations">
            <Button
              variant={(pendingInvites?.length ?? 0) > 0 ? "outline" : "ghost"}
              className={
                (pendingInvites?.length ?? 0) > 0 ? "border-orange-300" : ""
              }
            >
              <Mail className="mr-2 h-4 w-4" />
              {(pendingInvites?.length ?? 0) > 0
                ? `View Invitations (${pendingInvites?.length ?? 0})`
                : "Check Invitations"}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
