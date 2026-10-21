// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export const LIMITS = {
	/** how many members a multisig has, at least and at most. */
	minMembersPerMultisig: 2,
	maxMembersPerMultisig: 10,
	/** how many accounts a public key can be part of (not signer sets). */
	maxMultisigsPerPublicKey: 50,
	/** how many external proposers a multisig can have. */
	maxProposersPerMultisig: 5,
	/** The maximum expiry for signed messages we receive */
	maxSignatureExpiry: 60 * 60 * 1000,
	/** The maximum number of proposals to return per page. */
	maxProposalsPerPage: 100,
};
