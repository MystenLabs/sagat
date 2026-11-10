/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** `1` registers the local dev wallet (see src/dev-wallet.ts). */
	readonly VITE_DEV_WALLET?: string;
	/** `suiprivkey…` key for the dev wallet's "You (demo)" account. */
	readonly VITE_DEV_WALLET_SECRET_KEY?: string;
	/** Sentry DSN; without it error reporting is off. */
	readonly VITE_SENTRY_DSN?: string;
	/** Release name attached to Sentry events. */
	readonly VITE_RELEASE?: string;
}
