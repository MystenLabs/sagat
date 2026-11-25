// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SagatApiError } from '@mysten/sagat';
import { parseSerializedSignature } from '@mysten/sui/cryptography';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { publicKeyFromRawBytes } from '@mysten/sui/verify';

import { content } from '../content';
import { apiClient } from './api';
import { reportUnexpected } from './error-reporting';
import { validatePublicKey } from './sui-utils';

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

/** A network shows the address can’t be a signer. */
export class SignerAddressError extends Error {
	network: NetworkName;
	constructor(network: NetworkName, message: string) {
		super(message);
		this.network = network;
	}
}

class MultisigAddressError extends SignerAddressError {
	constructor(network: NetworkName) {
		super(network, content.errors.multisigAsMember);
	}
}

// A source that answered, without a key for the address.
class NotFound extends Error {}

const GRAPHQL_TIMEOUT_MS = 10_000;

/**
 * A key from one network's GraphQL endpoint: the first transaction the
 * address sent carries its signature.
 *
 * Rejects with `NotFound` when there is none, and with a
 * `SignerAddressError` when the signature belongs to a multisig or the
 * address's own key is of a type signers can't have.
 */
async function lookupOnNetwork(
	address: string,
	network: NetworkName,
	client: SuiGraphQLClient,
): Promise<string> {
	const { data, errors } =
		await client.query<TransactionsQueryResult>({
			query: SENDER_TX_QUERY,
			variables: { address },
			signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
		});
	if (errors?.length) throw new Error(errors[0].message);

	const signatures =
		data?.transactions?.nodes?.[0]?.signatures?.map(
			(x) => x.signatureBytes,
		) ?? [];

	for (const signature of signatures) {
		if (!signature) continue;
		const parsed = parseSerializedSignature(signature);
		if (parsed.signatureScheme === 'MultiSig')
			throw new MultisigAddressError(network);

		let pubKey;
		if (parsed.signatureScheme === 'ZkLogin') {
			// zkLogin needs the address to pick its form; a sponsor's won't match.
			try {
				pubKey = publicKeyFromRawBytes(
					'ZkLogin',
					parsed.publicKey,
					{
						address,
					},
				);
			} catch {
				continue;
			}
		} else {
			pubKey = publicKeyFromRawBytes(
				parsed.signatureScheme,
				parsed.publicKey,
			);
		}
		if (pubKey.toSuiAddress() !== address) continue;

		const key = pubKey.toSuiPublicKey();
		if (!validatePublicKey(key).isValid)
			throw new SignerAddressError(
				network,
				content.errors.unsupportedKeyAsMember(
					parsed.signatureScheme,
				),
			);
		return key;
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
 * Throws a `SignerAddressError` when no source has a key and a network
 * shows the address is a multisig or has a key type signers can't have.
 */
export async function lookupPublicKey(
	address: string,
): Promise<PublicKeyLookup> {
	const sources = [
		lookupOnApi(address).catch((error: unknown) => {
			if (!(error instanceof NotFound))
				reportUnexpected(error, {
					operation: 'public-key-lookup',
				});
			throw error;
		}),
		...(
			Object.entries(gqlClients) as [
				NetworkName,
				SuiGraphQLClient,
			][]
		).map(([network, client]) =>
			lookupOnNetwork(address, network, client).catch(
				(error: unknown) => {
					if (
						!(error instanceof NotFound) &&
						!(error instanceof SignerAddressError)
					)
						reportUnexpected(error, {
							source: 'rpc',
							operation: 'public-key-lookup',
						});
					throw error;
				},
			),
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
		const refused = reasons.find(
			(r) => r instanceof SignerAddressError,
		);
		if (refused) throw refused;
		return reasons.some((r) => r instanceof NotFound)
			? { kind: 'missing' }
			: { kind: 'unreachable' };
	}
}
