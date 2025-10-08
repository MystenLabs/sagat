import type {
	MultisigWithMembers,
	ProposalWithSignatures,
} from '@mysten/sagat';

// Helper to calculate current weight of a proposal based on signatures
export const calculateCurrentWeight = (
	proposal: ProposalWithSignatures,
	multisigDetails: MultisigWithMembers | undefined,
) => {
	if (!multisigDetails?.members) return 0;

	let currentWeight = 0;
	for (const signature of proposal.signatures) {
		const member = multisigDetails.members.find(
			(m) => m.publicKey === signature.publicKey,
		);
		if (member) {
			currentWeight += member.weight;
		}
	}
	return currentWeight;
};

// Helper to get total weight (threshold) for the multisig
export const getTotalWeight = (
	multisigDetails: MultisigWithMembers | undefined,
) => {
	return multisigDetails?.threshold || 0;
};
