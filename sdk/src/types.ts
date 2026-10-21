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
