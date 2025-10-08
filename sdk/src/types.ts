export interface AuthConnectRequest {
	signature: string;
	expiry: string;
}

export interface AuthResponse {
	success: boolean;
}

export interface AuthCheckResponse {
	authenticated: boolean;
	addresses: Address[];
}

export interface Address {
	address: string;
	publicKey: string;
}

export interface CreateMultisigRequest {
	publicKeys: string[];
	weights: number[];
	threshold: number;
	name?: string;
}

export interface SignedMessageRequest {
	signature: string;
}

export interface MultisigWithMembers extends Multisig {
	members: MultisigMember[];
	totalMembers: number;
	totalWeight: number;
	proposers: Omit<MultisigProposer, 'multisigAddress'>[];
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
	proposerAddress: string;
	description: string | null;
	totalWeight: number;
	currentWeight: number;
	network: string;
}

/** A proposal with its signatures */
export interface ProposalWithSignatures extends Proposal {
	signatures: ProposalSignature[];
}

/** A signature for a given proposal  */
export interface ProposalSignature {
	proposalId: number;
	publicKey: string;
	signature: string;
}

/** External multisig proposer */
export interface MultisigProposer {
	multisigAddress: string;
	address: string;
	addedBy: string;
	addedAt: string;
}

/** The default layout for a paginated response */
export interface PaginatedResponse<T> {
	data: T[];
	hasNextPage: boolean;
	nextCursor: string;
}

export interface VoteProposalRequest {
	signature: string;
}

export interface VoteProposalResponse {
	hasReachedThreshold: boolean;
}

export interface CancelProposalRequest {
	signature: string;
}

// Address types
export interface Address {
	publicKey: string;
	address: string;
}
