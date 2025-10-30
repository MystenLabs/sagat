// Copyright (c) Mysten Labs, Inc.
// Modifications Copyright (c) 2025 IOTA Stiftung
// SPDX-License-Identifier: Apache-2.0

import { getFullnodeUrl } from '@iota/iota-sdk/client';

import { ValidationError } from '../errors';
import { type IotaNetwork } from '../utils/client';

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
		return network as IotaNetwork;
	},
);

export const IOTA_RPC_URL_testnet =
	process.env.IOTA_RPC_URL_testnet ||
	getFullnodeUrl('testnet');
export const IOTA_RPC_URL_mainnet =
	process.env.IOTA_RPC_URL_mainnet ||
	getFullnodeUrl('mainnet');
export const IOTA_RPC_URL_devnet =
	process.env.IOTA_RPC_URL_devnet ||
	getFullnodeUrl('devnet');
export const IOTA_RPC_URL_localnet =
	process.env.IOTA_RPC_URL_localnet ||
	getFullnodeUrl('localnet');

export const IOTA_RPC_URL = {
	mainnet: IOTA_RPC_URL_mainnet,
	testnet: IOTA_RPC_URL_testnet,
	devnet: IOTA_RPC_URL_devnet,
	localnet: IOTA_RPC_URL_localnet,
};

export const validateNetwork = (network: string) => {
	if (!SUPPORTED_NETWORKS.includes(network as IotaNetwork))
		throw new ValidationError(
			`Unsupported network: ${network}. Only ${SUPPORTED_NETWORKS.join(', ')} are supported.`,
		);
	return network as IotaNetwork;
};
