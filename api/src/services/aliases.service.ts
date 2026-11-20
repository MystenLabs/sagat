// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type AliasSet } from '@mysten/sagat';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../db';
import {
	SchemaAccountAliases,
	SchemaAccountAliasState,
	type AccountAliasState,
} from '../db/schema';
import {
	lockAccount,
	type DatabaseTransaction,
} from '../db/transaction';
import {
	AliasStateUnavailableError,
	isLockTimeout,
	toError,
} from '../errors';
import {
	aliasSetLoaders,
	type AliasSetLoaders,
} from '../loaders/alias-set.loader';
import { type SuiNetwork } from '../utils/client';
import {
	recordAccountEvent,
	SYSTEM_ACTOR,
} from './account-events.service';

export const ALIAS_STATE_MAX_AGE_MS = 60_000;

type Mirrored = { exists: boolean; version: string | null };

export type AliasRefreshResult = {
	accountAddress: string;
} & (
	| ({ outcome: 'unchanged' | 'kept' } & Mirrored)
	| ({
			outcome: 'updated';
			added: string[];
			removed: string[];
	  } & (
			| { exists: true; version: string; digest: string }
			| { exists: false; version: null; digest: null }
	  ))
	| { outcome: 'failed'; error: Error }
);

export type StaleAliasRefreshResult =
	| AliasRefreshResult
	| ({
			accountAddress: string;
			outcome: 'fresh';
	  } & Mirrored);

type StateRow = Pick<
	AccountAliasState,
	| 'accountAddress'
	| 'exists'
	| 'observedVersion'
	| 'observedAt'
>;

const mirrored = (row: StateRow): Mirrored => ({
	exists: row.exists,
	version:
		row.observedVersion === null
			? null
			: String(row.observedVersion),
});

const sameAs = (row: StateRow, read: AliasSet) =>
	row.exists === read.exists &&
	(row.observedVersion === null
		? read.version === null
		: read.version !== null &&
			BigInt(row.observedVersion) === BigInt(read.version));

// The object cannot be deleted, so a read behind the mirror is a lagging node.
const isBehind = (row: StateRow, read: AliasSet) =>
	row.exists &&
	(!read.exists ||
		(row.observedVersion !== null &&
			BigInt(read.version) < BigInt(row.observedVersion)));

export const needsRefresh = (
	row: Pick<StateRow, 'observedAt'> | undefined,
	now = Date.now(),
) =>
	!row ||
	row.observedAt.getTime() > now ||
	now - row.observedAt.getTime() > ALIAS_STATE_MAX_AGE_MS;

const stateOf = (account: string, network: SuiNetwork) =>
	and(
		eq(SchemaAccountAliasState.accountAddress, account),
		eq(SchemaAccountAliasState.network, network),
	);

const readStateRows = async (
	accounts: string[],
	network: SuiNetwork,
): Promise<Map<string, StateRow>> => {
	const rows = await db
		.select({
			accountAddress:
				SchemaAccountAliasState.accountAddress,
			exists: SchemaAccountAliasState.exists,
			observedVersion:
				SchemaAccountAliasState.observedVersion,
			observedAt: SchemaAccountAliasState.observedAt,
		})
		.from(SchemaAccountAliasState)
		.where(
			and(
				inArray(
					SchemaAccountAliasState.accountAddress,
					accounts,
				),
				eq(SchemaAccountAliasState.network, network),
			),
		);
	return new Map(
		rows.map((row) => [row.accountAddress, row]),
	);
};

// Moves `observed_at` only while the row still holds what was read.
const touch = async (
	executor: Pick<DatabaseTransaction, 'update'>,
	account: string,
	network: SuiNetwork,
	read: AliasSet,
	readAt: Date,
) => {
	const updated = await executor
		.update(SchemaAccountAliasState)
		.set({
			observedAt: sql`GREATEST(${SchemaAccountAliasState.observedAt}, ${sql.param(readAt, SchemaAccountAliasState.observedAt)})`,
		})
		.where(
			and(
				stateOf(account, network),
				eq(SchemaAccountAliasState.exists, read.exists),
				sql`${SchemaAccountAliasState.observedVersion} IS NOT DISTINCT FROM ${read.version === null ? null : Number(read.version)}`,
			),
		)
		.returning({
			account: SchemaAccountAliasState.accountAddress,
		});
	return updated.length > 0;
};

const difference = (before: string[], after: string[]) => ({
	added: after.filter((a) => !before.includes(a)).sort(),
	removed: before.filter((a) => !after.includes(a)).sort(),
});

const writeMirror = (
	account: string,
	network: SuiNetwork,
	read: AliasSet,
	readAt: Date,
): Promise<AliasRefreshResult> =>
	db.transaction(async (tx) => {
		await lockAccount(tx, account);
		const [row] = await tx
			.select()
			.from(SchemaAccountAliasState)
			.where(stateOf(account, network));

		if (row && isBehind(row, read))
			return {
				accountAddress: account,
				outcome: 'kept',
				...mirrored(row),
			};
		if (row && sameAs(row, read)) {
			await touch(tx, account, network, read, readAt);
			return {
				accountAddress: account,
				outcome: 'unchanged',
				...mirrored(row),
			};
		}

		const aliasRows = and(
			eq(SchemaAccountAliases.accountAddress, account),
			eq(SchemaAccountAliases.network, network),
		);
		const current = await tx
			.select({
				address: SchemaAccountAliases.aliasAddress,
			})
			.from(SchemaAccountAliases)
			.where(aliasRows);
		const before =
			current.length > 0
				? current.map((r) => r.address)
				: [account];

		const state = {
			exists: read.exists,
			observedVersion:
				read.version === null ? null : Number(read.version),
			observedAt: readAt,
		};
		await tx
			.insert(SchemaAccountAliasState)
			.values({
				accountAddress: account,
				network,
				...state,
			})
			.onConflictDoUpdate({
				target: [
					SchemaAccountAliasState.accountAddress,
					SchemaAccountAliasState.network,
				],
				set: state,
			});
		await tx.delete(SchemaAccountAliases).where(aliasRows);

		if (!read.exists)
			return {
				accountAddress: account,
				outcome: 'updated',
				exists: false,
				version: null,
				digest: null,
				added: [],
				removed: [],
			};

		await tx.insert(SchemaAccountAliases).values(
			read.aliases.map((aliasAddress) => ({
				accountAddress: account,
				network,
				aliasAddress,
			})),
		);
		const { added, removed } = difference(
			before,
			read.aliases,
		);
		const proof = {
			kind: 'chain',
			digest: read.previousTransaction,
			objectVersion: read.version,
		} as const;
		for (const [action, subjects] of [
			['alias.added', added],
			['alias.removed', removed],
		] as const)
			for (const subject of subjects)
				await recordAccountEvent(tx, {
					action,
					accountAddress: account,
					actor: SYSTEM_ACTOR,
					subject,
					network,
					proof,
				});

		return {
			accountAddress: account,
			outcome: 'updated',
			exists: true,
			version: read.version,
			digest: read.previousTransaction,
			added,
			removed,
		};
	});

const refreshOne = async (
	account: string,
	network: SuiNetwork,
	read: AliasSet | Error,
	row: StateRow | undefined,
	readAt: Date,
): Promise<AliasRefreshResult> => {
	if (read instanceof Error)
		return {
			accountAddress: account,
			outcome: 'failed',
			error: read,
		};
	try {
		if (
			row &&
			sameAs(row, read) &&
			(await touch(db, account, network, read, readAt))
		)
			return {
				accountAddress: account,
				outcome: 'unchanged',
				...mirrored(row),
			};
		return await writeMirror(
			account,
			network,
			read,
			readAt,
		);
	} catch (error) {
		return {
			accountAddress: account,
			outcome: 'failed',
			error: toError(error),
		};
	}
};

// Re-reads the alias sets from the chain and updates the mirror. The addresses must be accounts.
export const refreshAliases = async (
	accountAddresses: string[],
	network: SuiNetwork,
	loaders: AliasSetLoaders = aliasSetLoaders,
): Promise<AliasRefreshResult[]> => {
	const inputs = accountAddresses.map((address) =>
		normalizeSuiAddress(address),
	);
	const accounts = [...new Set(inputs)];
	if (accounts.length === 0) return [];

	const readAt = new Date();
	const reads = await loaders(network).loadMany(accounts);
	const rows = await readStateRows(accounts, network);

	const results = new Map(
		await Promise.all(
			accounts.map(
				async (account, i) =>
					[
						account,
						await refreshOne(
							account,
							network,
							reads[i],
							rows.get(account),
							readAt,
						),
					] as const,
			),
		),
	);
	return inputs.map((account) => results.get(account)!);
};

// Refreshes only the accounts whose state is missing or older than the max age.
export const refreshStaleAliases = async (
	accountAddresses: string[],
	network: SuiNetwork,
	loaders: AliasSetLoaders = aliasSetLoaders,
): Promise<StaleAliasRefreshResult[]> => {
	const inputs = accountAddresses.map((address) =>
		normalizeSuiAddress(address),
	);
	const rows = await readStateRows(
		[...new Set(inputs)],
		network,
	);
	const now = Date.now();
	const stale = inputs.filter((account) =>
		needsRefresh(rows.get(account), now),
	);
	const refreshed = new Map(
		(await refreshAliases(stale, network, loaders)).map(
			(result) => [result.accountAddress, result],
		),
	);

	return inputs.map((account) => {
		const result = refreshed.get(account);
		if (result) return result;
		return {
			accountAddress: account,
			outcome: 'fresh',
			...mirrored(rows.get(account)!),
		};
	});
};

// For writers: throws when the account needed a refresh and it failed.
export const requireFreshAliases = async (
	accountAddress: string,
	network: SuiNetwork,
	loaders: AliasSetLoaders = aliasSetLoaders,
): Promise<
	Exclude<StaleAliasRefreshResult, { outcome: 'failed' }>
> => {
	const account = normalizeSuiAddress(accountAddress);
	// A lock timeout keeps the API's own "busy" answer.
	const unavailable = (cause: unknown) =>
		isLockTimeout(cause)
			? cause
			: new AliasStateUnavailableError(account, network, {
					cause,
				});
	let result: StaleAliasRefreshResult;
	try {
		[result] = await refreshStaleAliases(
			[account],
			network,
			loaders,
		);
	} catch (error) {
		throw unavailable(error);
	}
	if (result.outcome === 'failed')
		throw unavailable(result.error);
	return result;
};
