// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { parseSerializedSignature } from '@mysten/sui/cryptography';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { publicKeyFromRawBytes } from '@mysten/sui/verify';

const GRAPHQL_URLS = {
	mainnet: 'https://graphql.mainnet.sui.io/graphql',
	testnet: 'https://graphql.testnet.sui.io/graphql',
	devnet: 'https://graphql.devnet.sui.io/graphql',
} as const;

export type NetworkName = keyof typeof GRAPHQL_URLS;

const gqlClients = Object.fromEntries(
	Object.entries(GRAPHQL_URLS).map(([network, url]) => [
		network,
		new SuiGraphQLClient({ url, network }),
	]),
) as Record<NetworkName, SuiGraphQLClient>;

const SENDER_TX_QUERY = `
query ($address: SuiAddress!) {
	transactions(filter: { sentAddress: $address }, first: 1) {
		nodes {
			signatures {
				signatureBytes
			}
		}
	}
}
`;

interface TransactionsQueryResult {
	transactions?: {
		nodes?: {
			signatures?: { signatureBytes?: string }[];
		}[];
	};
}

export interface OnChainPublicKeyResult {
	publicKey: string;
	network: NetworkName;
}

export class MultisigAddressError extends Error {
	network: NetworkName;
	constructor(network: NetworkName) {
		super(
			'This address is a multisig wallet. A multisig cannot be added as a member of another multisig.',
		);
		this.network = network;
	}
}

/**
 * Queries a single network's GraphQL endpoint for a transaction sent by `address`,
 * then extracts the public key from the first signature.
 *
 * Throws `MultisigAddressError` if the signature belongs to a multisig.
 */
async function lookupOnNetwork(
	address: string,
	network: NetworkName,
	client: SuiGraphQLClient,
): Promise<OnChainPublicKeyResult | null> {
	const { data } =
		await client.query<TransactionsQueryResult>({
			query: SENDER_TX_QUERY,
			variables: { address },
		});

	const signatures =
		data?.transactions?.nodes?.[0]?.signatures?.map(
			(x) => x.signatureBytes,
		);
	if (!signatures || signatures.length === 0) return null;

	for (const signature of signatures) {
		if (!signature) continue;
		const parsed = parseSerializedSignature(signature);
		if (parsed.signatureScheme === 'MultiSig')
			throw new MultisigAddressError(network);

		const pubKey = publicKeyFromRawBytes(
			parsed.signatureScheme,
			parsed.publicKey,
		);

		if (pubKey.toSuiAddress() === address)
			return {
				publicKey: pubKey.toSuiPublicKey(),
				network,
			};
	}

	return null;
}

/**
 * Best-effort lookup across mainnet, testnet, and devnet in parallel.
 * Returns the first successful result, or `null` if no transaction is found.
 *
 * Throws `MultisigAddressError` if any network detects a multisig signature.
 */
export async function findPublicKeyOnChain(
	address: string,
): Promise<OnChainPublicKeyResult | null> {
	const results = await Promise.allSettled(
		(
			Object.entries(gqlClients) as [
				NetworkName,
				SuiGraphQLClient,
			][]
		).map(([network, client]) =>
			lookupOnNetwork(address, network, client),
		),
	);

	// Prioritise multisig detection — surface it even if another network succeeded.
	for (const r of results) {
		if (
			r.status === 'rejected' &&
			r.reason instanceof MultisigAddressError
		) {
			throw r.reason;
		}
	}

	return (
		results.find(
			(
				r,
			): r is PromiseFulfilledResult<OnChainPublicKeyResult> =>
				r.status === 'fulfilled' && r.value !== null,
		)?.value ?? null
	);
}
