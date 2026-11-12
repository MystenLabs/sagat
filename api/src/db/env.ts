// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ValidationError } from '../errors';
import { type SuiNetwork } from '../utils/client';
import {
	optionalEnv,
	requiredEnv,
	requiredListEnv,
} from '../utils/env';

const jwtSecret = requiredEnv('JWT_SECRET');
const supportedNetworks = requiredListEnv(
	'SUPPORTED_NETWORKS',
	'SUPPORTED_NETWORKS is not set. Please set it to a comma-separated list of supported networks.',
);
const corsAllowedOrigins = requiredListEnv(
	'CORS_ALLOWED_ORIGINS',
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

const DEFAULT_RPC_URLS: Record<SuiNetwork, string> = {
	mainnet: 'https://fullnode.mainnet.sui.io:443',
	testnet: 'https://fullnode.testnet.sui.io:443',
	devnet: 'https://fullnode.devnet.sui.io:443',
	localnet: 'http://127.0.0.1:9000',
};

export const SUI_RPC_URL_testnet =
	optionalEnv('SUI_RPC_URL_testnet') ??
	DEFAULT_RPC_URLS.testnet;
export const SUI_RPC_URL_mainnet =
	optionalEnv('SUI_RPC_URL_mainnet') ??
	DEFAULT_RPC_URLS.mainnet;
export const SUI_RPC_URL_devnet =
	optionalEnv('SUI_RPC_URL_devnet') ??
	DEFAULT_RPC_URLS.devnet;
export const SUI_RPC_URL_localnet =
	optionalEnv('SUI_RPC_URL_localnet') ??
	DEFAULT_RPC_URLS.localnet;

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
