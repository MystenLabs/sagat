/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Registers the local dev wallet (see src/dev-wallet.ts). */
	readonly VITE_DEV_WALLET?: string;
	/** `suiprivkey…` key for the dev wallet's "You (demo)" account. */
	readonly VITE_DEV_WALLET_SECRET_KEY?: string;
}
