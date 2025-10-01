// Auth types
export interface AuthConnectRequest {
  publicKey: string;
  signature: string;
  expiry: string;
}

export interface AuthResponse {
  success: boolean;
}

export interface AuthCheckResponse {
  authenticated: boolean;
  publicKeys?: string[];
  addresses?: string[];
}

// Multisig types
export interface CreateMultisigRequest {
  publicKey: string;
  publicKeys: string[];
  weights: number[];
  threshold: number;
  name?: string;
}

export interface AcceptMultisigRequest {
  publicKey: string;
  signature: string;
}

export interface Multisig {
  address: string;
  isVerified: boolean;
  threshold: number;
  name: string | null;
}

export interface MultisigMember {
  multisigAddress: string;
  publicKey: string;
  weight: number;
  isAccepted: boolean;
  isRejected: boolean;
  order: number;
}

// Proposal types
export enum ProposalStatus {
  PENDING = 0,
  CANCELLED = 1,
  SUCCESS = 2,
  FAILURE = 3,
}

export interface CreateProposalRequest {
  multisigAddress: string;
  transactionBytes: string;
  publicKey: string;
  signature: string;
  description?: string;
  network: string;
}

export interface Proposal {
  id: number;
  multisigAddress: string;
  digest: string;
  status: ProposalStatus;
  transactionBytes: string;
  builtTransactionBytes: string;
  proposerAddress: string;
  description: string | null;
  totalWeight: number;
  currentWeight: number;
  network: string;
}

export interface ProposalSignature {
  proposalId: number;
  publicKey: string;
  signature: string;
}

export interface MultisigWithMembers extends Multisig {
  members: MultisigMember[];
  totalMembers: number;
  totalWeight: number;
}

// this is the multisig view, for a given public key.
export interface MultisigWithMembersForPublicKey extends MultisigWithMembers {
  rejectedMembers: number;
  pendingMembers: number;
  isAccepted: boolean;
}
export interface ProposalWithSignatures extends Proposal {
  signatures: ProposalSignature[];
}

export interface VoteProposalRequest {
  publicKey: string;
  signature: string;
}

export interface CancelProposalRequest {
  publicKey: string;
  signature: string;
}

// Address types
export interface Address {
  publicKey: string;
  address: string;
}
