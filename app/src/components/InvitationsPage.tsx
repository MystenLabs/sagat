import { Link } from "react-router-dom";
import { useUserMultisigs } from "../hooks/useUserMultisigs";
import { Button } from "./ui/button";
import { Loading } from "./ui/loading";
import { EmptyState } from "./ui/empty-state";
import { PageHeader } from "./ui/page-header";
import { InvitationCard } from "./invitations/InvitationCard";

export function InvitationsPage() {
  const { data: multisigs, isLoading } = useUserMultisigs(true);

  if (isLoading) return <Loading message="Loading invitations..." />;

  const pendingInvites = multisigs?.filter((m) => !m.isAccepted) ?? [];

  return (
    <div className="max-w-4xl mx-auto mt-8 px-4">
      <PageHeader
        title="Pending Invitations"
        description={`You have ${pendingInvites.length} pending invitation${pendingInvites.length !== 1 ? "s" : ""} to join multisig wallets`}
        backLink="/"
        backLabel="Back to Dashboard"
      />

      {pendingInvites.length === 0 ? (
        <EmptyState
          title="No pending invitations"
          description="You don't have any pending multisig invitations at the moment"
          action={
            <Link to="/">
              <Button variant="outline">Back to Dashboard</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {pendingInvites.map((multisig) => (
            <InvitationCard key={multisig.address} multisig={multisig} />
          ))}
        </div>
      )}
    </div>
  );
}
