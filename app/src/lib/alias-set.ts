// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Reads pods' alias sets and the chain identifier from the app's own node.
import {
	ALIAS_OBJECT_INCLUDE,
	decodeAliasSet,
	deriveAliasesObjectId,
	type AliasObjectEntry,
} from '@mysten/sagat';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import {
	isValidSuiAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';

/** A pod's alias set on one network, as the app's node gave it. */
export type AliasRead =
	// Normalized addresses; `[pod]` when the pod has no alias object.
	{ kind: 'read'; aliases: string[] } | { kind: 'failed' };

const ALIAS_READ_BATCH_SIZE = 50;

const FAILED: AliasRead = { kind: 'failed' };

/** The alias reads of `pods` (normalized) from their `getObjects` entries, which come back in request order. */
export function aliasReadsFromEntries(
	pods: readonly string[],
	entries: readonly AliasObjectEntry[],
): Map<string, AliasRead> {
	return new Map(
		pods.map((pod, i): [string, AliasRead] => {
			try {
				const { aliases } = decodeAliasSet(pod, entries[i]);
				return [pod, { kind: 'read', aliases }];
			} catch {
				return [pod, FAILED];
			}
		}),
	);
}

/** Reads the alias sets of `pods` in one `getObjects` call per 50 pods. Never throws: a pod whose read failed is `failed`. */
export async function readAliasSets(
	client: ClientWithCoreApi,
	pods: readonly string[],
): Promise<Map<string, AliasRead>> {
	const unique = [
		...new Set(pods.map((pod) => normalizeSuiAddress(pod))),
	];
	const reads = new Map<string, AliasRead>(
		unique.map((pod) => [pod, FAILED]),
	);
	const valid = unique.filter(isValidSuiAddress);
	const chunks = Array.from(
		{
			length: Math.ceil(
				valid.length / ALIAS_READ_BATCH_SIZE,
			),
		},
		(_, i) =>
			valid.slice(
				i * ALIAS_READ_BATCH_SIZE,
				(i + 1) * ALIAS_READ_BATCH_SIZE,
			),
	);
	await Promise.all(
		chunks.map(async (chunk) => {
			let entries;
			try {
				({ objects: entries } =
					await client.core.getObjects({
						objectIds: chunk.map(deriveAliasesObjectId),
						include: ALIAS_OBJECT_INCLUDE,
					}));
			} catch {
				return;
			}
			for (const [pod, read] of aliasReadsFromEntries(
				chunk,
				entries,
			))
				reads.set(pod, read);
		}),
	);
	return reads;
}

/** The chain identifier the node reports, or null when it couldn't be read. */
export async function readChainIdentifier(
	client: ClientWithCoreApi,
): Promise<string | null> {
	try {
		const { chainIdentifier } =
			await client.core.getChainIdentifier();
		return chainIdentifier;
	} catch {
		return null;
	}
}
