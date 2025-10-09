import type {
	MultisigWithMembers,
	PublicProposal,
} from '@mysten/sagat';

// Extended type that adds frontend-specific fields for displaying multisig state
// for a specific public key
export interface MultisigWithMembersForPublicKey
	extends MultisigWithMembers {
	rejectedMembers: number;
	pendingMembers: number;
	isAccepted: boolean;
	isRejected: boolean;
}

export interface ProposalCardInput extends PublicProposal {
	isPublic: boolean;
	proposers: string[];
}
