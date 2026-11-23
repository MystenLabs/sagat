// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Who signs for an account on a network: its acting signer sets, read from
 * the alias mirror, each key's answer for the account, and the original set.
 * The only reader of `account_aliases` for that question.
 */

import {
	and,
	desc,
	eq,
	exists,
	inArray,
	isNull,
	ne,
	notExists,
	or,
	sql,
} from 'drizzle-orm';
import {
	alias,
	union,
	unionAll,
} from 'drizzle-orm/pg-core';

import { db } from '../db';
import {
	SchemaAccountAcceptances,
	SchemaAccountAliases,
	SchemaAccountEvents,
	SchemaAccounts,
	SchemaAccountSignerSets,
	SchemaAddresses,
	SchemaSignerSetMembers,
	SchemaSignerSets,
	type SignerSetMember,
	type SignerSetWithMembers,
} from '../db/schema';
import {
	SignerSetDataLoader,
	withMembers,
} from '../loaders/signer-set.loader';
import { type SuiNetwork } from '../utils/client';
import {
	compareStrings,
	unwrap,
} from '../utils/collections';

export type SignerScope =
	| { kind: 'original' }
	| { kind: 'acting'; network: SuiNetwork };
export type SignerScopeKind = SignerScope['kind'];
export const ORIGINAL_SET: SignerScope = {
	kind: 'original',
};
export const actingSetsOn = (
	network: SuiNetwork,
): SignerScope => ({ kind: 'acting', network });

export type KeyAnswer = 'accepted' | 'rejected' | 'invited';

export type ActingMember = {
	publicKey: string;
	weight: number;
	order: number;
	// The key's answer for the account, not for this composition.
	answer: KeyAnswer;
};

export type ActingSignerSet = {
	kind: 'signer_set' | 'key';
	address: string;
	threshold: number;
	members: ActingMember[];
};

export type AccountSigners = {
	accountAddress: string;
	accountName: string | null;
	// Always returned. Decides nothing.
	originalSet: SignerSetWithMembers | null;
	actingSets: ActingSignerSet[];
	otherSignerSets: string[];
};

// The key's member row at the account's own address; with the acceptance row it gives the answer.
const originalMember = alias(
	SchemaSignerSetMembers,
	'original_member',
);

const answerSql = sql<KeyAnswer>`CASE
	WHEN ${originalMember.isAccepted} OR ${SchemaAccountAcceptances.isAccepted} THEN 'accepted'
	WHEN ${originalMember.isRejected} OR ${SchemaAccountAcceptances.isRejected} THEN 'rejected'
	ELSE 'invited' END`;

export const memberAnswer = (
	member: SignerSetMember,
): KeyAnswer =>
	member.isAccepted
		? 'accepted'
		: member.isRejected
			? 'rejected'
			: 'invited';

// The account's signers under the original scope, from its original set.
export const originalSigners = (
	set: SignerSetWithMembers,
): AccountSigners => ({
	accountAddress: set.address,
	accountName: set.name,
	originalSet: set,
	actingSets: [
		{
			kind: 'signer_set',
			address: set.address,
			threshold: set.threshold,
			members: set.members.map((member) => ({
				publicKey: member.publicKey,
				weight: member.weight,
				order: member.order,
				answer: memberAnswer(member),
			})),
		},
	],
	otherSignerSets: [],
});

const resolveOriginal = async (addresses: string[]) => {
	const sets = (
		await SignerSetDataLoader.loadMany(addresses)
	).map(unwrap);
	const result = new Map<string, AccountSigners>();
	for (const set of sets)
		if (set) result.set(set.address, originalSigners(set));
	return result;
};

const readActingRows = (
	addresses: string[],
	network: SuiNetwork,
) => {
	const ownAliases = alias(
		SchemaAccountAliases,
		'own_aliases',
	);
	const hasAlias = (own: boolean) =>
		db
			.select({ one: sql`1` })
			.from(ownAliases)
			.where(
				and(
					eq(
						ownAliases.accountAddress,
						SchemaAccounts.address,
					),
					eq(ownAliases.network, network),
					own
						? eq(
								ownAliases.aliasAddress,
								SchemaAccounts.address,
							)
						: undefined,
				),
			);
	// Each alias row acts; the account's own address is always read, and acts when listed or when nothing is.
	const candidates = db.$with('candidates').as(
		unionAll(
			db
				.select({
					accountAddress:
						sql<string>`${SchemaAccountAliases.accountAddress}`.as(
							'candidate_account',
						),
					address:
						sql<string>`${SchemaAccountAliases.aliasAddress}`.as(
							'candidate_address',
						),
					acts: sql<boolean>`true`.as('candidate_acts'),
				})
				.from(SchemaAccountAliases)
				.where(
					and(
						inArray(
							SchemaAccountAliases.accountAddress,
							addresses,
						),
						eq(SchemaAccountAliases.network, network),
						ne(
							SchemaAccountAliases.aliasAddress,
							SchemaAccountAliases.accountAddress,
						),
					),
				),
			db
				.select({
					accountAddress:
						sql<string>`${SchemaAccounts.address}`.as(
							'candidate_account',
						),
					address:
						sql<string>`${SchemaAccounts.address}`.as(
							'candidate_address',
						),
					acts: sql<boolean>`${or(
						exists(hasAlias(true)),
						notExists(hasAlias(false)),
					)}`.as('candidate_acts'),
				})
				.from(SchemaAccounts)
				.where(inArray(SchemaAccounts.address, addresses)),
		),
	);

	const publicKey = sql<string>`COALESCE(${SchemaSignerSetMembers.publicKey}, ${SchemaAddresses.publicKey})`;
	return db
		.with(candidates)
		.select({
			accountAddress: SchemaAccounts.address,
			accountName: SchemaAccounts.name,
			alias: candidates.address,
			acts: candidates.acts,
			set: SchemaSignerSets,
			member: SchemaSignerSetMembers,
			aliasKey: SchemaAddresses.publicKey,
			answer: answerSql,
		})
		.from(candidates)
		.innerJoin(
			SchemaAccounts,
			eq(SchemaAccounts.address, candidates.accountAddress),
		)
		.leftJoin(
			SchemaSignerSets,
			eq(SchemaSignerSets.address, candidates.address),
		)
		.leftJoin(
			SchemaSignerSetMembers,
			eq(
				SchemaSignerSetMembers.signerSetAddress,
				SchemaSignerSets.address,
			),
		)
		.leftJoin(
			SchemaAddresses,
			and(
				isNull(SchemaSignerSets.address),
				eq(SchemaAddresses.address, candidates.address),
			),
		)
		.leftJoin(
			originalMember,
			and(
				eq(
					originalMember.signerSetAddress,
					SchemaAccounts.address,
				),
				eq(originalMember.publicKey, publicKey),
			),
		)
		.leftJoin(
			SchemaAccountAcceptances,
			and(
				eq(
					SchemaAccountAcceptances.accountAddress,
					SchemaAccounts.address,
				),
				eq(SchemaAccountAcceptances.publicKey, publicKey),
			),
		);
};

type ActingRow = Awaited<
	ReturnType<typeof readActingRows>
>[number];

const byOrder = (
	a: { order: number },
	b: { order: number },
) => a.order - b.order;

const groupByAccount = (rows: ActingRow[]) => {
	const groups = new Map<string, ActingRow[]>();
	for (const row of rows) {
		const group = groups.get(row.accountAddress);
		if (group) group.push(row);
		else groups.set(row.accountAddress, [row]);
	}
	return groups;
};

// The set at the account's own address, whether or not it acts.
const originalSetOf = (
	account: string,
	rows: ActingRow[],
): SignerSetWithMembers | null => {
	const own = rows.filter((row) => row.alias === account);
	const set = own.find((row) => row.set)?.set;
	if (!set) return null;
	return withMembers(
		set,
		own.flatMap((row) => (row.member ? [row.member] : [])),
	);
};

const actingSetsOf = (
	rows: ActingRow[],
): Pick<
	AccountSigners,
	'actingSets' | 'otherSignerSets'
> => {
	const sets = new Map<string, ActingSignerSet>();
	const otherSignerSets: string[] = [];
	for (const row of rows) {
		if (!row.acts) continue;
		if (row.set) {
			const set: ActingSignerSet = sets.get(row.alias) ?? {
				kind: 'signer_set',
				address: row.alias,
				threshold: row.set.threshold,
				members: [],
			};
			sets.set(row.alias, set);
			if (row.member)
				set.members.push({
					publicKey: row.member.publicKey,
					weight: row.member.weight,
					order: row.member.order,
					answer: row.answer,
				});
		} else if (row.aliasKey !== null) {
			sets.set(row.alias, {
				kind: 'key',
				address: row.alias,
				threshold: 1,
				members: [
					{
						publicKey: row.aliasKey,
						weight: 1,
						order: 0,
						answer: row.answer,
					},
				],
			});
		} else {
			otherSignerSets.push(row.alias);
		}
	}
	const actingSets = [...sets.values()].sort((a, b) =>
		compareStrings(a.address, b.address),
	);
	for (const set of actingSets) set.members.sort(byOrder);
	return {
		actingSets,
		otherSignerSets: otherSignerSets.sort(),
	};
};

const resolveActing = async (
	addresses: string[],
	network: SuiNetwork,
) => {
	const rows = await readActingRows(addresses, network);
	const result = new Map<string, AccountSigners>();
	for (const [account, accountRows] of groupByAccount(rows))
		result.set(account, {
			accountAddress: account,
			accountName: accountRows[0].accountName,
			originalSet: originalSetOf(account, accountRows),
			...actingSetsOf(accountRows),
		});
	return result;
};

// One entry per address that resolves. Acting scope: every address that is an account. Original scope: every address that has a signer set.
export const resolveSigners = async (
	accountAddresses: string[],
	scope: SignerScope,
): Promise<Map<string, AccountSigners>> => {
	const addresses = [...new Set(accountAddresses)];
	if (addresses.length === 0) return new Map();
	return scope.kind === 'original'
		? resolveOriginal(addresses)
		: resolveActing(addresses, scope.network);
};

export const resolveAccountSigners = async (
	accountAddress: string,
	scope: SignerScope,
): Promise<AccountSigners | undefined> =>
	(await resolveSigners([accountAddress], scope)).get(
		accountAddress,
	);

// The key's answer for the account, or null when it is in no acting set.
export const keyAnswer = (
	signers: AccountSigners,
	publicKey: string,
): KeyAnswer | null => {
	for (const set of signers.actingSets)
		for (const member of set.members)
			if (member.publicKey === publicKey)
				return member.answer;
	return null;
};

// Whether one of the keys is in an acting set, and has accepted when `acceptedOnly`.
export const signsFor = (
	signers: AccountSigners,
	publicKeys: string[],
	acceptedOnly: boolean,
): boolean =>
	publicKeys.some((key) => {
		const answer = keyAnswer(signers, key);
		return acceptedOnly
			? answer === 'accepted'
			: answer !== null;
	});

export type SignerSetProgress = {
	signerSet: ActingSignerSet;
	// Sum of the weights of the members that signed.
	currentWeight: number;
	hasReachedThreshold: boolean;
};

// A key counts in each set that holds it.
export const countSignatures = (
	actingSets: ActingSignerSet[],
	signedKeys: string[],
): {
	sets: SignerSetProgress[];
	hasReachedThreshold: boolean;
} => {
	const signed = new Set(signedKeys);
	const sets = actingSets.map((signerSet) => {
		const currentWeight = signerSet.members
			.filter((member) => signed.has(member.publicKey))
			.reduce((sum, member) => sum + member.weight, 0);
		return {
			signerSet,
			currentWeight,
			hasReachedThreshold:
				currentWeight >= signerSet.threshold,
		};
	});
	return {
		sets,
		hasReachedThreshold: sets.some(
			(set) => set.hasReachedThreshold,
		),
	};
};

// Every set a key is in, and the accounts where such a set acts on the network. One row per (account, key).
const actingForKeys = (
	publicKeys: string[],
	network: SuiNetwork,
) => {
	// Every set a key is in: its compositions, and its own address unless a composition has it.
	const sets = db.$with('key_sets').as(
		union(
			db
				.select({
					setAddress:
						sql<string>`${SchemaSignerSetMembers.signerSetAddress}`.as(
							'set_address',
						),
					publicKey:
						sql<string>`${SchemaSignerSetMembers.publicKey}`.as(
							'set_key',
						),
				})
				.from(SchemaSignerSetMembers)
				.where(
					inArray(
						SchemaSignerSetMembers.publicKey,
						publicKeys,
					),
				),
			db
				.select({
					setAddress:
						sql<string>`${SchemaAddresses.address}`.as(
							'set_address',
						),
					publicKey:
						sql<string>`${SchemaAddresses.publicKey}`.as(
							'set_key',
						),
				})
				.from(SchemaAddresses)
				.where(
					and(
						inArray(SchemaAddresses.publicKey, publicKeys),
						notExists(
							db
								.select({ one: sql`1` })
								.from(SchemaSignerSets)
								.where(
									eq(
										SchemaSignerSets.address,
										SchemaAddresses.address,
									),
								),
						),
					),
				),
		),
	);

	const ownAliases = alias(
		SchemaAccountAliases,
		'own_aliases',
	);
	// The accounts where such a set acts: listed as an alias, or the account itself with no alias rows.
	const acting = db.$with('acting').as(
		union(
			db
				.select({
					accountAddress:
						sql<string>`${SchemaAccountAliases.accountAddress}`.as(
							'acting_account',
						),
					publicKey: sql<string>`${sets.publicKey}`.as(
						'acting_key',
					),
				})
				.from(sets)
				.innerJoin(
					SchemaAccountAliases,
					and(
						eq(
							SchemaAccountAliases.aliasAddress,
							sets.setAddress,
						),
						eq(SchemaAccountAliases.network, network),
					),
				),
			db
				.select({
					accountAddress:
						sql<string>`${SchemaAccounts.address}`.as(
							'acting_account',
						),
					publicKey: sql<string>`${sets.publicKey}`.as(
						'acting_key',
					),
				})
				.from(sets)
				.innerJoin(
					SchemaAccounts,
					eq(SchemaAccounts.address, sets.setAddress),
				)
				.where(
					notExists(
						db
							.select({ one: sql`1` })
							.from(ownAliases)
							.where(
								and(
									eq(
										ownAliases.accountAddress,
										SchemaAccounts.address,
									),
									eq(ownAliases.network, network),
								),
							),
					),
				),
		),
	);
	return { sets, acting };
};

// The accounts where one of the keys is in an acting set on the network with that answer. One row per (account, key).
export const listActingAccounts = async (
	publicKeys: string[],
	network: SuiNetwork,
	answer: KeyAnswer,
): Promise<
	{ accountAddress: string; publicKey: string }[]
> => {
	if (publicKeys.length === 0) return [];
	const { sets, acting } = actingForKeys(
		publicKeys,
		network,
	);

	return db
		.with(sets, acting)
		.select({
			accountAddress: acting.accountAddress,
			publicKey: acting.publicKey,
		})
		.from(acting)
		.leftJoin(
			originalMember,
			and(
				eq(
					originalMember.signerSetAddress,
					acting.accountAddress,
				),
				eq(originalMember.publicKey, acting.publicKey),
			),
		)
		.leftJoin(
			SchemaAccountAcceptances,
			and(
				eq(
					SchemaAccountAcceptances.accountAddress,
					acting.accountAddress,
				),
				eq(
					SchemaAccountAcceptances.publicKey,
					acting.publicKey,
				),
			),
		)
		.where(sql`${answerSql} = ${answer}`);
};

// The accounts the keys are tied to on the network (a key's set acts there, a link's composition holds a key, or a key answered) where a tied key accepted, or with `accepted: false` one did not.
export const listTiedAccounts = async (
	publicKeys: string[],
	network: SuiNetwork,
	accepted: boolean,
): Promise<string[]> => {
	if (publicKeys.length === 0) return [];
	const { sets, acting } = actingForKeys(
		publicKeys,
		network,
	);
	const tied = db.$with('tied').as(
		union(
			db
				.select({
					accountAddress:
						sql<string>`${acting.accountAddress}`.as(
							'tied_account',
						),
					publicKey: sql<string>`${acting.publicKey}`.as(
						'tied_key',
					),
				})
				.from(acting),
			db
				.select({
					accountAddress:
						sql<string>`${SchemaAccountSignerSets.accountAddress}`.as(
							'tied_account',
						),
					publicKey:
						sql<string>`${SchemaSignerSetMembers.publicKey}`.as(
							'tied_key',
						),
				})
				.from(SchemaAccountSignerSets)
				.innerJoin(
					SchemaSignerSetMembers,
					eq(
						SchemaSignerSetMembers.signerSetAddress,
						SchemaAccountSignerSets.signerSetAddress,
					),
				)
				.where(
					inArray(
						SchemaSignerSetMembers.publicKey,
						publicKeys,
					),
				),
			db
				.select({
					accountAddress:
						sql<string>`${SchemaAccountAcceptances.accountAddress}`.as(
							'tied_account',
						),
					publicKey:
						sql<string>`${SchemaAccountAcceptances.publicKey}`.as(
							'tied_key',
						),
				})
				.from(SchemaAccountAcceptances)
				.where(
					inArray(
						SchemaAccountAcceptances.publicKey,
						publicKeys,
					),
				),
		),
	);
	const rows = await db
		.with(sets, acting, tied)
		.selectDistinct({ accountAddress: tied.accountAddress })
		.from(tied)
		.leftJoin(
			originalMember,
			and(
				eq(
					originalMember.signerSetAddress,
					tied.accountAddress,
				),
				eq(originalMember.publicKey, tied.publicKey),
			),
		)
		.leftJoin(
			SchemaAccountAcceptances,
			and(
				eq(
					SchemaAccountAcceptances.accountAddress,
					tied.accountAddress,
				),
				eq(
					SchemaAccountAcceptances.publicKey,
					tied.publicKey,
				),
			),
		)
		.where(
			accepted
				? sql`${answerSql} = 'accepted'`
				: sql`${answerSql} <> 'accepted'`,
		);
	return rows.map((row) => row.accountAddress).sort();
};

export type RemovedFromAccount = {
	accountAddress: string;
	accountName: string | null;
	publicKey: string;
	// The set that was removed and holds the key.
	signerSetAddress: string;
	eventId: number;
	removedAt: Date;
};

// Accounts a key accepted, is in no acting set of on the network, and whose set holding it was removed there. The newest removal per account and set.
export const listRemovedAccounts = async (
	publicKeys: string[],
	network: SuiNetwork,
): Promise<RemovedFromAccount[]> => {
	if (publicKeys.length === 0) return [];
	const { sets, acting } = actingForKeys(
		publicKeys,
		network,
	);
	const accepted = db.$with('accepted').as(
		union(
			db
				.select({
					accountAddress:
						sql<string>`${SchemaSignerSetMembers.signerSetAddress}`.as(
							'accepted_account',
						),
					publicKey:
						sql<string>`${SchemaSignerSetMembers.publicKey}`.as(
							'accepted_key',
						),
				})
				.from(SchemaSignerSetMembers)
				.where(
					and(
						inArray(
							SchemaSignerSetMembers.publicKey,
							publicKeys,
						),
						eq(SchemaSignerSetMembers.isAccepted, true),
					),
				),
			db
				.select({
					accountAddress:
						sql<string>`${SchemaAccountAcceptances.accountAddress}`.as(
							'accepted_account',
						),
					publicKey:
						sql<string>`${SchemaAccountAcceptances.publicKey}`.as(
							'accepted_key',
						),
				})
				.from(SchemaAccountAcceptances)
				.where(
					and(
						inArray(
							SchemaAccountAcceptances.publicKey,
							publicKeys,
						),
						eq(SchemaAccountAcceptances.isAccepted, true),
					),
				),
		),
	);
	const removal = db
		.select({
			id: SchemaAccountEvents.id,
			createdAt: SchemaAccountEvents.createdAt,
		})
		.from(SchemaAccountEvents)
		.where(
			and(
				eq(
					SchemaAccountEvents.accountAddress,
					accepted.accountAddress,
				),
				eq(SchemaAccountEvents.action, 'alias.removed'),
				eq(SchemaAccountEvents.network, network),
				eq(SchemaAccountEvents.subject, sets.setAddress),
			),
		)
		.orderBy(desc(SchemaAccountEvents.id))
		.limit(1)
		.as('removal');

	return db
		.with(sets, acting, accepted)
		.selectDistinctOn(
			[accepted.accountAddress, sets.setAddress],
			{
				accountAddress: accepted.accountAddress,
				accountName: SchemaAccounts.name,
				publicKey: accepted.publicKey,
				signerSetAddress: sets.setAddress,
				eventId: removal.id,
				removedAt: removal.createdAt,
			},
		)
		.from(accepted)
		.innerJoin(
			SchemaAccounts,
			eq(SchemaAccounts.address, accepted.accountAddress),
		)
		.innerJoin(sets, eq(sets.publicKey, accepted.publicKey))
		.innerJoinLateral(removal, sql`true`)
		.where(
			notExists(
				db
					.select({ one: sql`1` })
					.from(acting)
					.where(
						and(
							eq(
								acting.accountAddress,
								accepted.accountAddress,
							),
							eq(acting.publicKey, accepted.publicKey),
						),
					),
			),
		)
		.orderBy(
			accepted.accountAddress,
			sets.setAddress,
			accepted.publicKey,
		);
};

// The other networks whose alias set for the account differs from this network's. No alias rows counts as `{account}`.
export const networksWithDifferentSigners = async (
	accountAddress: string,
	network: SuiNetwork,
	networks: SuiNetwork[],
): Promise<SuiNetwork[]> => {
	const rows = await db
		.select({
			network: SchemaAccountAliases.network,
			alias: SchemaAccountAliases.aliasAddress,
		})
		.from(SchemaAccountAliases)
		.where(
			and(
				eq(
					SchemaAccountAliases.accountAddress,
					accountAddress,
				),
				inArray(SchemaAccountAliases.network, [
					...new Set([network, ...networks]),
				]),
			),
		);
	const aliasSetOn = (on: SuiNetwork) => {
		const aliases = rows
			.filter((row) => row.network === on)
			.map((row) => row.alias)
			.sort();
		return (
			aliases.length > 0 ? aliases : [accountAddress]
		).join();
	};
	const here = aliasSetOn(network);
	return networks.filter(
		(other) =>
			other !== network && aliasSetOn(other) !== here,
	);
};
