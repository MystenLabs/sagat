// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Types of the `/v1` API, named after the spec's components, plus the
 * hand-typed `/auth` routes, which are shared with the legacy API and not
 * in the spec.
 */

import { type components } from './generated/v1.js';

export type Address = components['schemas']['Address'];

export interface AuthResponse {
	success: boolean;
}

export interface AuthCheckResponse {
	authenticated: boolean;
	addresses: Address[];
}
