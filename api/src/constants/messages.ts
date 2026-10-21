// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The personal messages a key signs, as the API verifies them. They are
 * defined here instead of imported from the SDKs so the API needs neither
 * SDK at runtime; `test/messages.test.ts` keeps them equal to the
 * `PersonalMessages` of both.
 */

// The legacy routes' texts, as `sdk-legacy/src/constants.ts` has them.
export const LegacyMessages = {
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

// The `/v1` texts, as `sdk/src/constants.ts` has them: the legacy ones,
// except the proposer messages, which name the account.
export const V1Messages = {
	connect: LegacyMessages.connect,
	acceptSignerSetInvitation:
		LegacyMessages.acceptMultisigInvitation,
	rejectSignerSetInvitation:
		LegacyMessages.rejectMultisigInvitation,
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
	cancelProposal: LegacyMessages.cancelProposal,
} as const;
