// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SagatApiError } from '@mysten/sagat';
import { parseSerializedSignature } from '@mysten/sui/cryptography';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { publicKeyFromRawBytes } from '@mysten/sui/verify';

import { apiClient } from './api';

const GRAPHQL_URLS = {
	mainnet: 'https://graphql.mainnet.sui.io/graphql',
	testnet: 'https://graphql.testnet.sui.io/graphql',
	devnet: 'https://graphql.devnet.sui.io/graphql',
} as const;

type NetworkName = keyof typeof GRAPHQL_URLS;

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

export class MultisigAddressError extends Error {
	network: NetworkName;
	constructor(network: NetworkName) {
		super(
			'This address is a multisig wallet. A multisig cannot be added as a member of another multisig.',
		);
		this.network = network;
	}
}

// A source that answered, without a key for the address.
class NotFound extends Error {}

const GRAPHQL_TIMEOUT_MS = 10_000;

/**
 * A key from one network's GraphQL endpoint: the first transaction the
 * address sent carries its signature.
 *
 * Rejects with `NotFound` when there is none, and with
 * `MultisigAddressError` when the signature belongs to a multisig.
 */
async function lookupOnNetwork(
	address: string,
	network: NetworkName,
	client: SuiGraphQLClient,
): Promise<string> {
	const { data } =
		await client.query<TransactionsQueryResult>({
			query: SENDER_TX_QUERY,
			variables: { address },
			signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
		});

	const signatures =
		data?.transactions?.nodes?.[0]?.signatures?.map(
			(x) => x.signatureBytes,
		) ?? [];

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
			return pubKey.toSuiPublicKey();
	}

	throw new NotFound();
}

/** A key from the API, which knows every address that signed in here. */
async function lookupOnApi(
	address: string,
): Promise<string> {
	let info;
	try {
		info = await apiClient.getAddressInfo(address);
	} catch (error) {
		// A 4xx is the API's answer for an address it doesn't know.
		if (
			error instanceof SagatApiError &&
			error.status >= 400 &&
			error.status < 500
		)
			throw new NotFound();
		throw error;
	}
	if (!info?.publicKey) throw new NotFound();
	return info.publicKey;
}

export type PublicKeyLookup =
	| { kind: 'found'; publicKey: string }
	/** Every source answered, and none knows a key. */
	| { kind: 'missing' }
	/** No source answered (offline, 5xx, timeouts). */
	| { kind: 'unreachable' };

/**
 * The public key behind an address, from the API or from a transaction it
 * sent on mainnet, testnet or devnet. Resolves as soon as any of them has
 * the key.
 *
 * Throws `MultisigAddressError` when no source has a key and a network
 * shows the address is a multisig.
 */
export async function lookupPublicKey(
	address: string,
): Promise<PublicKeyLookup> {
	const sources = [
		lookupOnApi(address),
		...(
			Object.entries(gqlClients) as [
				NetworkName,
				SuiGraphQLClient,
			][]
		).map(([network, client]) =>
			lookupOnNetwork(address, network, client),
		),
	];

	try {
		return {
			kind: 'found',
			publicKey: await Promise.any(sources),
		};
	} catch (error) {
		const reasons: unknown[] =
			error instanceof AggregateError
				? error.errors
				: [error];
		const multisig = reasons.find(
			(r) => r instanceof MultisigAddressError,
		);
		if (multisig) throw multisig;
		return reasons.some((r) => r instanceof NotFound)
			? { kind: 'missing' }
			: { kind: 'unreachable' };
	}
}
