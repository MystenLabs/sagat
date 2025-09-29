import { useParams, useNavigate, NavLink, Outlet, Navigate } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useUserMultisigs } from "../hooks/useUserMultisigs";
import { Loading } from "./ui/loading";
import { Button } from "./ui/button";
import { FileText, Info, Coins, Plus, Copy, Check } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { ProposalSheet } from "./ProposalSheet";
import { MultisigSelector } from "./MultisigSelector";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api";
import { QueryKeys } from "../lib/queryKeys";

export function MultisigDetailPage() {
  const { address, tab } = useParams<{ address: string; tab?: string }>();
  const navigate = useNavigate();
  const currentAccount = useCurrentAccount();
  const [showProposalSheet, setShowProposalSheet] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  const { data: multisigs, isLoading } = useUserMultisigs(true);

  // Query specific multisig details to check verification status
  const { data: multisigDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: [QueryKeys.Multisig, address],
    queryFn: () => apiClient.getMultisig(address!),
    enabled: !!address,
    retry: false, // Don't retry if multisig doesn't exist
  });

  // Filter for verified multisigs only
  const verifiedMultisigs = useMemo(
    () => multisigs?.filter(m => m.isVerified && m.isAccepted) ?? [],
    [multisigs]
  );

  // Handle multisig selection change
  const handleMultisigChange = (newAddress: string) => {
    navigate(`/multisig/${newAddress}/${tab || 'proposals'}`);
  };


  // Store the current multisig address in localStorage per wallet address
  useEffect(() => {
    const multisig = verifiedMultisigs.find(m => m.address === address);
    if (address && multisig?.isVerified && multisig?.isAccepted && currentAccount?.address) {
      const lastViewedKey = `lastViewedMultisig_${currentAccount.address}`;
      localStorage.setItem(lastViewedKey, address);
    }
  }, [address, verifiedMultisigs, currentAccount?.address]);

  if (isLoading || isLoadingDetails) {
    return <Loading message="Loading multisig details..." />;
  }

  // If we're trying to access a specific multisig but it's not verified, redirect to dashboard
  if (address && multisigDetails && !multisigDetails.isVerified) {
    return <Navigate to="/" replace />;
  }

  // If we're trying to access a multisig that doesn't exist, redirect to dashboard
  if (address && !isLoadingDetails && !multisigDetails) {
    return <Navigate to="/" replace />;
  }

  if (verifiedMultisigs.length === 0) {
    return <Navigate to="/" replace />;
  }

  const multisig = verifiedMultisigs.find(m => m.address === address);

  if (!multisig) {
    // Multisig not found for current wallet - redirect to dashboard which will handle smart routing
    return <Navigate to="/" replace />;
  }

  const tabs = [
    {
      id: 'proposals',
      label: 'Proposals',
      icon: FileText,
      count: multisig.pendingProposals > 0 ? multisig.pendingProposals : undefined
    },
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'assets', label: 'Assets', icon: Coins },
  ];

  // Remove this line since we'll use NavLink's built-in active state

  return (
    <div className="container mx-auto mt-8 px-4">
      {/* Header */}
      <div className="mb-6">
        {/* Multisig Selector & Info */}
        <div className="bg-white border rounded-lg p-6 mb-6">
          <div className="flex flex-col gap-6">
            {/* Multisig Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <MultisigSelector
                  multisigs={verifiedMultisigs}
                  selectedMultisig={address!}
                  onSelectMultisig={handleMultisigChange}
                />
              </div>
              <div className="flex items-center space-x-3 flex-shrink-0">
                <Button
                  variant="outline"
                  onClick={() => copy(address!)}
                  className="whitespace-nowrap"
                  title="Copy multisig address"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button onClick={() => setShowProposalSheet(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Proposal
                </Button>
              </div>
            </div>

            {/* Quick Info Bar */}
            <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap pt-4 border-t">
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full">
                {multisig.threshold} threshold • {multisig.totalMembers} members
              </span>
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                {multisig.isVerified ? 'Verified' : 'Pending'}
              </span>
              {multisig.pendingProposals > 0 && (
                <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
                  {multisig.pendingProposals} pending proposals
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="overflow-x-auto border-b">
          <div className="flex space-x-1 min-w-max">
            {tabs.map((tabItem) => {
              const Icon = tabItem.icon;

              return (
                <NavLink
                  key={tabItem.id}
                  to={`/multisig/${address}/${tabItem.id}`}
                  className={({ isActive }) =>
                    `px-4 py-2 text-sm font-medium transition-colors relative whitespace-nowrap flex items-center gap-2 ${
                      isActive
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {tabItem.label}
                  {tabItem.count && (
                    <span className="ml-1 px-2 py-0.5 text-xs bg-orange-100 text-orange-600 rounded-full">
                      {tabItem.count}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div>
        <Outlet context={{ multisig, openProposalSheet: () => setShowProposalSheet(true) }} />
      </div>

      {/* Proposal Creation Sheet */}
      <ProposalSheet
        open={showProposalSheet}
        onOpenChange={setShowProposalSheet}
        multisigAddress={address!}
      />
    </div>
  );
}
