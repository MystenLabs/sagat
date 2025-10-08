export const CONFIG = {
	// Authentication
	AUTH_EXPIRY_MINUTES: 30,

	// UI/UX
	COPY_FEEDBACK_DURATION: 2000, // ms

	// API & Caching
	REFETCH_INTERVAL: 60000, // 1 minute
	STALE_TIME: 300000, // 5 minutes

	// Multisig Limits
	MAX_MEMBERS: 10,
	MIN_MEMBERS: 2,
	MIN_THRESHOLD: 1,

	// Network
	DEFAULT_NETWORK: 'testnet' as const,

	// Pagination
	DEFAULT_PAGE_SIZE: 20,

	// Explorer URLs
	EXPLORER_URLS: {
		testnet: 'https://suiscan.xyz/testnet',
		mainnet: 'https://suiscan.xyz/mainnet',
		localnet: 'http://localhost:9001', // For local development
	},
} as const;

export type Network = keyof typeof CONFIG.EXPLORER_URLS;

// Validation constants
export const VALIDATION = {
	// Address validation
	SUI_ADDRESS_LENGTH: 66, // Including 0x prefix

	// Form validation
	MAX_MULTISIG_NAME_LENGTH: 50,
	MAX_PROPOSAL_DESCRIPTION_LENGTH: 500,

	// Transaction limits
	MAX_TRANSACTION_SIZE: 1024 * 1024, // 1MB
} as const;

// Error messages
export const ERROR_MESSAGES = {
	NETWORK_ERROR:
		'Network connection failed. Please check your internet connection.',
	INVALID_ADDRESS: 'Please enter a valid Sui address.',
	INSUFFICIENT_SIGNATURES:
		'Not enough signatures to execute this proposal.',
	TRANSACTION_FAILED:
		'Transaction failed. Please try again.',
	WALLET_NOT_CONNECTED:
		'Please connect your wallet to continue.',
} as const;
