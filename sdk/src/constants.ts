// A list of personal messages being singed to authorize different actions in the system.
export const PersonalMessages = {
	connect: (expiry: string) =>
		`Verifying address ownership until: ${expiry}`,
	acceptMultisigInvitation: (multisigAddress: string) =>
		`Participating in multisig ${multisigAddress}`,
	rejectMultisigInvitation: (multisigAddress: string) =>
		`Rejecting multisig invitation ${multisigAddress}`,
	addMultisigProposer: (
		proposer: string,
		multisigAddress: string,
		expiry: string,
	) =>
		`Adding proposer ${proposer} to multisig ${multisigAddress}. Valid until: ${expiry}`,
	removeMultisigProposer: (
		proposer: string,
		multisigAddress: string,
		expiry: string,
	) =>
		`Removing proposer ${proposer} from multisig ${multisigAddress}. Valid until: ${expiry}`,
	cancelProposal: (proposalId: number) =>
		`Cancel proposal ${proposalId}`,
} as const;

/**
 * The default Sagat API URL.
 */
export const getDefaultSagatApiUrl = (
	mode: 'live' | 'local',
) => {
	return mode === 'live'
		? 'https://api.sagat.mystenlabs.com'
		: 'http://localhost:3000';
};

/**
 * The default expiry for signed personal messages. Defaults to 10 minutes.
 * @returns The default expiry time for a signature.
 */
export const defaultExpiry = () => {
	const expiry = new Date();
	expiry.setMinutes(expiry.getMinutes() + 10); // 10 minutes from now
	return expiry.toISOString();
};
