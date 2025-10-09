import { getFullnodeUrl } from '@mysten/sui/client';

import { ValidationError } from '../errors';
import { SuiNetwork } from '../utils/client';

const jwtSecret = process.env.JWT_SECRET;
const supportedNetworks =
	process.env.SUPPORTED_NETWORKS?.split(',').map(
		(network) => network.trim(),
	);
const corsAllowedOrigins =
	process.env.CORS_ALLOWED_ORIGINS?.split(',').map(
		(origin) => origin.trim(),
	);

if (!jwtSecret) throw new Error('JWT_SECRET is not set');
if (!supportedNetworks)
	throw new Error(
		'SUPPORTED_NETWORKS is not set. Please set it to a comma-separated list of supported networks.',
	);
if (!corsAllowedOrigins)
	throw new Error(
		'CORS_ALLOWED_ORIGINS is not set. Please set it to a comma-separated list of allowed origins.',
	);

// We append `forced_v{x}` when we wanna log everyone off for a good reason.
// V1: We logged people off to make sure we migrate pubkeys to always be with flags.
export const JWT_SECRET = 'forced_v1_' + jwtSecret;
export const CORS_ALLOWED_ORIGINS = corsAllowedOrigins;
export const SUPPORTED_NETWORKS = supportedNetworks.map(
	(network) => {
		if (
			![
				'mainnet',
				'testnet',
				'devnet',
				'localnet',
			].includes(network)
		)
			throw new Error(`Unsupported network: ${network}`);
		return network as SuiNetwork;
	},
);

export const SUI_RPC_URL_testnet =
	process.env.SUI_RPC_URL_testnet ||
	getFullnodeUrl('testnet');
export const SUI_RPC_URL_mainnet =
	process.env.SUI_RPC_URL_mainnet ||
	getFullnodeUrl('mainnet');
export const SUI_RPC_URL_devnet =
	process.env.SUI_RPC_URL_devnet ||
	getFullnodeUrl('devnet');
export const SUI_RPC_URL_localnet =
	process.env.SUI_RPC_URL_localnet ||
	getFullnodeUrl('localnet');

export const SUI_RPC_URL = {
	mainnet: SUI_RPC_URL_mainnet,
	testnet: SUI_RPC_URL_testnet,
	devnet: SUI_RPC_URL_devnet,
	localnet: SUI_RPC_URL_localnet,
};

export const validateNetwork = (network: string) => {
	if (!SUPPORTED_NETWORKS.includes(network as SuiNetwork))
		throw new ValidationError(
			`Unsupported network: ${network}. Only ${SUPPORTED_NETWORKS.join(', ')} are supported.`,
		);
	return network as SuiNetwork;
};
