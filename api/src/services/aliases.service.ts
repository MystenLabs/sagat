// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The account alias mirror (docs/account-rotation.md, "Refresh").
 *
 * The chain is the source of truth. `account_alias_state` records what the
 * last refresh saw per account and network, `account_aliases` mirrors the
 * alias set, and `refreshAliases` is the only code that writes either. No
 * state row means the network was never refreshed; a state row with
 * `exists = false` means the alias set is `{account}`.
 */

import type { ClientWithCoreApi } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { and, asc, eq, notInArray, sql } from 'drizzle-orm';

import { db } from '../db';
import { SUPPORTED_NETWORKS } from '../db/env';
import {
	SchemaAccountAliases,
	SchemaAccountAliasState,
	SchemaAccounts,
} from '../db/schema';
import {
	AliasStateUnavailableError,
	NotFoundError,
} from '../errors';
import { fetchAliasSet } from '../utils/aliases';
import {
	getSuiClient,
	type SuiNetwork,
} from '../utils/client';
import { recordEvent } from './events';

/**
 * Access checks re-read the alias set from chain when the state row of the
 * network is older than this, so a key removed outside Sagat loses access
 * within this time.
 */
export const ACCESS_CHECK_MAX_AGE_MS = 60_000;

export interface RefreshResult {
	/** False when the account never called `enable` on this network. */
	exists: boolean;
	/** Version of the `AddressAliases` object, or null when it does not exist. */
	version: string | null;
	/** The alias set. `[account]` when the object does not exist. */
	aliases: string[];
	/** Addresses in the alias set now that were not before (implicit `{account}` included). */
	added: string[];
	/** Addresses in the alias set before that are not now (implicit `{account}` included). */
	removed: string[];
}

export interface MirroredAliases {
	/** The alias set as last mirrored, `[account]` when the object does not exist or the network was never refreshed. */
	aliases: string[];
	/** False when the network was never refreshed: `aliases` is then the default, not an observation. */
	known: boolean;
	/** Whether the alias object existed at the last refresh. */
	exists: boolean;
	observedAt: Date | null;
	observedVersion: number | null;
}

const implicitAliases = (accountAddress: string) => [
	accountAddress,
];

const diff = (before: string[], after: string[]) => ({
	added: after.filter((a) => !before.includes(a)),
	removed: before.filter((a) => !after.includes(a)),
});

/**
 * Re-read the alias set of `accountAddress` on `network` from chain and
 * update the mirror in one transaction. Returns the set and what changed.
 *
 * Throws `NotFoundError` for an address that is not an account, before any
 * RPC. RPC errors are thrown before anything is written. `client` is only
 * for tests; callers use the network's default client.
 *
 * The mirror never moves backwards: a read older than the mirror, or a
 * "not found" after the object was seen, writes nothing. The alias object
 * cannot be deleted once `enable` ran, so both mean a lagging or wrong node.
 */
export async function refreshAliases(
	accountAddress: string,
	network: SuiNetwork,
	options: { client?: ClientWithCoreApi } = {},
): Promise<RefreshResult> {
	const account = normalizeSuiAddress(accountAddress);
	if (!(await accountExists(account)))
		throw new NotFoundError(`Account ${account} not found`);

	const onChain = await fetchAliasSet(
		options.client ?? getSuiClient(network),
		account,
	);

	const result = await db.transaction(async (tx) => {
		// Serialize refreshes of the same account and network, so the diff is
		// computed against what the previous refresh committed.
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`account_aliases:${account}:${network}`}))`,
		);

		const [state] = await tx
			.select()
			.from(SchemaAccountAliasState)
			.where(
				and(
					eq(
						SchemaAccountAliasState.accountAddress,
						account,
					),
					eq(SchemaAccountAliasState.network, network),
				),
			);
		const where = and(
			eq(SchemaAccountAliases.accountAddress, account),
			eq(SchemaAccountAliases.network, network),
		);
		const beforeAliases = state?.exists
			? (
					await tx
						.select({
							aliasAddress:
								SchemaAccountAliases.aliasAddress,
						})
						.from(SchemaAccountAliases)
						.where(where)
						.orderBy(asc(SchemaAccountAliases.aliasAddress))
				).map((row) => row.aliasAddress)
			: implicitAliases(account);

		if (
			state?.exists &&
			(!onChain.exists ||
				(onChain.version !== null &&
					state.observedVersion !== null &&
					BigInt(onChain.version) <
						BigInt(state.observedVersion)))
		) {
			return {
				exists: true,
				version:
					state.observedVersion === null
						? null
						: String(state.observedVersion),
				aliases: beforeAliases,
				added: [],
				removed: [],
			};
		}

		const observedAt = new Date();
		const observedVersion =
			onChain.version === null
				? null
				: Number(onChain.version);
		await tx
			.insert(SchemaAccountAliasState)
			.values({
				accountAddress: account,
				network,
				exists: onChain.exists,
				observedVersion,
				observedAt,
			})
			.onConflictDoUpdate({
				target: [
					SchemaAccountAliasState.accountAddress,
					SchemaAccountAliasState.network,
				],
				set: {
					exists: onChain.exists,
					observedVersion,
					observedAt,
				},
			});

		if (!onChain.exists) {
			await tx.delete(SchemaAccountAliases).where(where);
		} else {
			await tx
				.insert(SchemaAccountAliases)
				.values(
					onChain.aliases.map((aliasAddress) => ({
						accountAddress: account,
						network,
						aliasAddress,
					})),
				)
				.onConflictDoNothing();
			await tx
				.delete(SchemaAccountAliases)
				.where(
					and(
						where,
						notInArray(
							SchemaAccountAliases.aliasAddress,
							onChain.aliases,
						),
					),
				);
		}

		return {
			exists: onChain.exists,
			version: onChain.version,
			aliases: onChain.aliases,
			...diff(beforeAliases, onChain.aliases),
		};
	});

	recordEvent({
		type: 'alias_refreshed',
		network,
		accountAddress: account,
		version: result.version,
	});
	for (const aliasAddress of result.added)
		recordEvent({
			type: 'alias_added',
			network,
			accountAddress: account,
			aliasAddress,
		});
	for (const aliasAddress of result.removed)
		recordEvent({
			type: 'alias_removed',
			network,
			accountAddress: account,
			aliasAddress,
		});

	return result;
}

export async function accountExists(
	accountAddress: string,
): Promise<boolean> {
	const account = await db.query.SchemaAccounts.findFirst({
		columns: { address: true },
		where: eq(
			SchemaAccounts.address,
			normalizeSuiAddress(accountAddress),
		),
	});
	return !!account;
}

/** The mirrored alias set of an account on a network. Database only. */
export async function getMirroredAliases(
	accountAddress: string,
	network: SuiNetwork,
): Promise<MirroredAliases> {
	const account = normalizeSuiAddress(accountAddress);
	const [[state], rows] = await Promise.all([
		db
			.select()
			.from(SchemaAccountAliasState)
			.where(
				and(
					eq(
						SchemaAccountAliasState.accountAddress,
						account,
					),
					eq(SchemaAccountAliasState.network, network),
				),
			),
		db
			.select({
				aliasAddress: SchemaAccountAliases.aliasAddress,
			})
			.from(SchemaAccountAliases)
			.where(
				and(
					eq(SchemaAccountAliases.accountAddress, account),
					eq(SchemaAccountAliases.network, network),
				),
			)
			.orderBy(asc(SchemaAccountAliases.aliasAddress)),
	]);

	return {
		aliases: state?.exists
			? rows.map((row) => row.aliasAddress)
			: implicitAliases(account),
		known: !!state,
		exists: state?.exists ?? false,
		observedAt: state?.observedAt ?? null,
		observedVersion: state?.observedVersion ?? null,
	};
}

/** True when the mirror needs a refresh before an access decision. */
export const isStale = (
	mirror: Pick<MirroredAliases, 'known' | 'observedAt'>,
	now = Date.now(),
) =>
	!mirror.known ||
	!mirror.observedAt ||
	now - mirror.observedAt.getTime() >
		ACCESS_CHECK_MAX_AGE_MS;

/**
 * The mirrored alias set, refreshed from chain first when `refresh` is true,
 * or when it is not false and the network was never refreshed or the state
 * is older than `ACCESS_CHECK_MAX_AGE_MS`. Pass `refresh: false` only when
 * the caller already refreshed in the same request. Throws
 * `AliasStateUnavailableError` when a needed refresh fails, and
 * `NotFoundError` for an address that is not an account.
 */
export async function getFreshAliases(
	accountAddress: string,
	network: SuiNetwork,
	options: { refresh?: boolean } = {},
): Promise<MirroredAliases> {
	const account = normalizeSuiAddress(accountAddress);
	const mirror = await getMirroredAliases(account, network);
	if (
		options.refresh === false ||
		(options.refresh !== true && !isStale(mirror))
	)
		return mirror;

	try {
		await refreshAliases(account, network);
	} catch (error) {
		if (error instanceof NotFoundError) throw error;
		throw new AliasStateUnavailableError(account, network, {
			cause: error,
		});
	}
	return getMirroredAliases(account, network);
}

/**
 * True if, on any supported network, the alias set is anything other than
 * exactly `{account}`. Refreshes a network first when its state is missing
 * or stale (see `getFreshAliases`). False for an address that is not an
 * account.
 */
export async function isRotated(
	accountAddress: string,
	options: { refresh?: boolean } = {},
): Promise<boolean> {
	const account = normalizeSuiAddress(accountAddress);
	if (!(await accountExists(account))) return false;
	const mirrors = await Promise.all(
		SUPPORTED_NETWORKS.map((network) =>
			getFreshAliases(account, network, options),
		),
	);
	return mirrors.some(
		({ aliases }) =>
			aliases.length !== 1 || aliases[0] !== account,
	);
}
