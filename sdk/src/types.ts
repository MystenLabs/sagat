// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Types of the `/v1` API, named after the spec's components, plus the
 * hand-typed `/auth` routes, which are shared with the legacy API and not
 * in the spec.
 */

import { type components } from './generated/v1.js';

type Schemas = components['schemas'];

export type Address = Schemas['Address'];
export type Account = Schemas['Account'];
export type AccountProposer = Schemas['AccountProposer'];
export type SignerSet = Schemas['SignerSet'];
export type SignerSetWithMembers =
	Schemas['SignerSetWithMembers'];
export type SignerSetMember = Schemas['SignerSetMember'];

export type Proposal = Schemas['Proposal'];
export type ProposalWithSignatures =
	Schemas['ProposalWithSignatures'];
export type ProposalSignature =
	Schemas['ProposalSignature'];
export type PublicProposal = Schemas['PublicProposal'];
export type ProposalSignerSet =
	Schemas['ProposalSignerSet'];
export type PublicSignerSetMember =
	Schemas['PublicSignerSetMember'];
export type VoteProposalResponse =
	Schemas['VoteProposalResponse'];

/** A page of a listing, as `GET /v1/proposals` returns it. */
export type PaginatedResponse<T> = Omit<
	Schemas['ProposalPage'],
	'data'
> & { data: T[] };

/** The `status` of a proposal. */
export enum ProposalStatus {
	PENDING = 0,
	CANCELLED = 1,
	SUCCESS = 2,
	FAILURE = 3,
}

export type CreateProposalRequest =
	Schemas['CreateProposalRequest'];
export type VoteProposalRequest =
	Schemas['VoteProposalRequest'];
export type CreateSignerSetRequest =
	Schemas['CreateSignerSetRequest'];
export type SignedMessageRequest =
	Schemas['SignedMessageRequest'];

export interface AuthResponse {
	success: boolean;
}

export interface AuthCheckResponse {
	authenticated: boolean;
	addresses: Address[];
}
