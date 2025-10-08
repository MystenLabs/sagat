import {
	SuiClient,
	SuiObjectData,
} from '@mysten/sui/client';

import { SUI_RPC_URL } from '../db/env';

export type SuiNetwork =
	| 'mainnet'
	| 'testnet'
	| 'devnet'
	| 'localnet';

export const getSuiClient = (network: SuiNetwork) => {
	return new SuiClient({ url: SUI_RPC_URL[network] });
};

// Query a list of objects
// TODO: use a data loader to share queries across requests.
export const queryAllOwnedObjects = async (
	objectIds: string[],
	network: SuiNetwork,
) => {
	const uniqueObjectIds = Array.from(new Set(objectIds));

	if (uniqueObjectIds.length === 0) {
		return [];
	}

	const batches = batchObjectRequests(uniqueObjectIds, 100);

	const allOwnedObjects: SuiObjectData[] = [];

	// Go through the batches & query the objects, pick out the `AddressOwner` ones.
	await Promise.all(
		batches.map(async (batch) => {
			const objects = await getSuiClient(
				network,
			).multiGetObjects({
				ids: batch,
				options: { showOwner: true },
			});

			for (const object of objects) {
				if (
					object.data?.owner &&
					typeof object.data.owner === 'object' &&
					'AddressOwner' in object.data.owner
				) {
					allOwnedObjects.push(object.data);
				}
			}
		}),
	);

	return allOwnedObjects;
};

function batchObjectRequests<T>(
	objectIds: T[],
	batchSize: number,
) {
	const batches = [];
	for (let i = 0; i < objectIds.length; i += batchSize) {
		batches.push(objectIds.slice(i, i + batchSize));
	}
	return batches;
}
