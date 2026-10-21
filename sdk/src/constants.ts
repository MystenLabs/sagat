// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The messages a key signs, as the API verifies them. Same as the legacy
 * SDK except the proposer messages, which name the account (see
 * docs/migration-guide.md, "Signed messages").
 */
export const PersonalMessages = {
	connect: (expiry: string) =>
		`Verifying address ownership until: ${expiry}`,
	acceptSignerSetInvitation: (signerSetAddress: string) =>
		`Participating in multisig ${signerSetAddress}`,
	rejectSignerSetInvitation: (signerSetAddress: string) =>
		`Rejecting multisig invitation ${signerSetAddress}`,
	addAccountProposer: (
		proposer: string,
		accountAddress: string,
		expiry: string,
	) =>
		`Adding proposer ${proposer} to account ${accountAddress}. Valid until: ${expiry}`,
	removeAccountProposer: (
		proposer: string,
		accountAddress: string,
		expiry: string,
	) =>
		`Removing proposer ${proposer} from account ${accountAddress}. Valid until: ${expiry}`,
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
