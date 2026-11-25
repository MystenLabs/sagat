// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export {
	SagatApiError,
	SagatClient,
	type Fetch,
	type SagatClientOptions,
} from './client.js';

export { ProposalStatus } from './types.js';

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

export {
	ADDRESS_ALIAS_STATE_ID,
	ALIAS_OBJECT_INCLUDE,
	AddressAliasesBcs,
	buildAdd,
	buildEnable,
	buildRemove,
	decodeAliasSet,
	deriveAliasesObjectId,
	findAliasCalls,
	MAX_ALIASES,
	type AliasCall,
	type AliasObjectEntry,
	type AliasSet,
} from './aliases.js';

export {
	buildSignerChange,
	checkSignerChange,
	compositionNote,
	isProofMet,
	namedChain,
	proofWeight,
	readCompositionNote,
	SignerChangeError,
	signerChangeProof,
	signersWhoStay,
	type Composition,
	type CompositionNote,
	type NoteEntry,
	type SignerChange,
	type SignerSetEntry,
} from './signer-change.js';
