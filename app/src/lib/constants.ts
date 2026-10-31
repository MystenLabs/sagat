// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export const CONFIG = {
	// Authentication
	AUTH_EXPIRY_MINUTES: 30,

	// UI/UX
	COPY_FEEDBACK_DURATION: 2000, // ms

	// API & Caching
	REFETCH_INTERVAL: 60000, // 1 minute
	STALE_TIME: 300000, // 5 minutes

	// Multisig limits, mirroring the API (api/src/constants/limits.ts)
	MAX_MEMBERS: 10,
	MIN_MEMBERS: 2,
	// A member's weight is a single byte in the multisig public key.
	MAX_WEIGHT: 255,
	// The API's MAX_KEY_LABEL_LENGTH, in characters (code points).
	MAX_KEY_LABEL_LENGTH: 64,

	// Network
	DEFAULT_NETWORK: 'testnet' as const,

	// Pagination
	DEFAULT_PAGE_SIZE: 20,
} as const;

// Validation constants
export const VALIDATION = {
	// Address validation
	SUI_ADDRESS_LENGTH: 66, // Including 0x prefix

	// Form validation
	MAX_MULTISIG_NAME_LENGTH: 40,
	MAX_PROPOSAL_DESCRIPTION_LENGTH: 500,

	// Transaction limits
	MAX_TRANSACTION_SIZE: 1024 * 1024, // 1MB
} as const;
