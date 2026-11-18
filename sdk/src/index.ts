// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export {
	SagatApiError,
	SagatClient,
	type Fetch,
	type SagatClientOptions,
} from './client.js';

export { ProposalStatus } from './types.js';

export * as v1 from './v1/schemas.js';
export {
	SagatResponseError,
	SagatV1Client,
	type SagatV1ClientOptions,
} from './v1/client.js';

export {
	PersonalMessages,
	defaultExpiry,
} from './constants.js';

export {
	verifyAccountEvent,
	verifyProposalCreated,
	verifyProposalProposer,
	verifyProposer,
	type ProofResult,
	type ProofStatus,
	type TrustedMembers,
} from './verify.js';

export type {
	AccountEvent,
	Address,
	AuthCheckResponse,
	AuthConnectRequest,
	AuthResponse,
	CreateMultisigRequest,
	CreateProposalRequest,
	Multisig,
	MultisigMember,
	MultisigProposer,
	MultisigWithMembers,
	PaginatedResponse,
	Proposal,
	ProposalEvents,
	ProposalSignature,
	ProposalWithSignatures,
	PublicProposal,
	SignedMessageRequest,
	VoteProposalRequest,
	VoteProposalResponse,
} from './types.js';
