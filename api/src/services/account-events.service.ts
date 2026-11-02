// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The account audit log. See "Audit log" in `docs/account-rotation.md`.
 *
 * Actions and proof kinds are checked by TypeScript, not a DB CHECK, so a new
 * action needs no migration. The database accepts anything, so this module
 * must stay the only writer.
 */

import { type PublicKey } from '@mysten/sui/cryptography';
import { and, desc, eq, lt } from 'drizzle-orm';

import { LIMITS } from '../constants/limits';
import { db } from '../db';
import {
	SchemaAccountEvents,
	type AccountEventRow,
} from '../db/schema';
import {
	lockAccount,
	type DatabaseTransaction,
} from '../db/transaction';
import { ApiAuthError } from '../errors';
import { jwtHasSignerSetMemberAccess } from './membership.service';

const DEFAULT_EVENTS_PER_PAGE = 50;

// The message is rebuilt from fields, so its text is never stored.
type SignedProof<Kind extends string, Fields = unknown> = {
	kind: Kind;
	version: 1;
	signature: string;
} & Fields;

// For rows nobody signed, such as a chain change. Nothing writes them yet.
export const SYSTEM_ACTOR = 'system';
type ChainProof = { kind: 'chain'; digest: string };

type MemberActor = string;

// A proposer event's `subject` is stored exactly as signed, not normalised.
type AccountEventRegistry = {
	'proposer.added': {
		actor: MemberActor;
		subject: string;
		proof: SignedProof<'proposer.add', { expiry: string }>;
	};
	'proposer.removed': {
		actor: MemberActor;
		subject: string;
		proof: SignedProof<
			'proposer.remove',
			{ expiry: string }
		>;
	};
};

// Every proof in the registry, plus `ChainProof`, which has no entry yet.
export type AccountEventProof =
	| {
			[A in keyof AccountEventRegistry]: Required<
				AccountEventRegistry[A]
			> extends { proof: infer Proof }
				? NonNullable<Proof>
				: never;
	  }[keyof AccountEventRegistry]
	| ChainProof;

type UnsetFields = {
	network?: null;
	subject?: null;
	before?: null;
	after?: null;
	proof?: null;
};

export type AccountEventAction = keyof AccountEventRegistry;

export type AccountEvent = {
	[A in AccountEventAction]: {
		action: A;
		accountAddress: string;
	} & AccountEventRegistry[A] &
		Omit<UnsetFields, keyof AccountEventRegistry[A]>;
}[AccountEventAction];

// Takes the lock so an account's ids follow commit order. A writer touching
// other rows must call `lockAccount` first, or it can deadlock.
export const recordAccountEvent = async (
	tx: DatabaseTransaction,
	event: AccountEvent,
): Promise<number> => {
	await lockAccount(tx, event.accountAddress);

	const [{ id }] = await tx
		.insert(SchemaAccountEvents)
		.values(event)
		.returning({ id: SchemaAccountEvents.id });
	return id;
};

export type StoredAccountEvent = Omit<
	AccountEventRow,
	'proof'
> & {
	proof?: AccountEventProof | null;
};

export const listAccountEvents = async ({
	accountAddress,
	callerKeys,
	before,
	limit = DEFAULT_EVENTS_PER_PAGE,
	action,
	subject,
	includeProof = false,
}: {
	accountAddress: string;
	callerKeys: PublicKey[];
	before?: number;
	limit?: number;
	action?: AccountEventAction;
	subject?: string;
	includeProof?: boolean;
}): Promise<StoredAccountEvent[]> => {
	if (
		!(await jwtHasSignerSetMemberAccess(
			accountAddress,
			callerKeys,
		))
	)
		throw new ApiAuthError('AccessDenied');

	const events =
		await db.query.SchemaAccountEvents.findMany({
			columns: includeProof ? undefined : { proof: false },
			where: and(
				eq(
					SchemaAccountEvents.accountAddress,
					accountAddress,
				),
				before !== undefined
					? lt(SchemaAccountEvents.id, before)
					: undefined,
				action !== undefined
					? eq(SchemaAccountEvents.action, action)
					: undefined,
				subject !== undefined
					? eq(SchemaAccountEvents.subject, subject)
					: undefined,
			),
			orderBy: [desc(SchemaAccountEvents.id)],
			limit:
				Number.isInteger(limit) &&
				limit > 0 &&
				limit <= LIMITS.maxAccountEventsPerPage
					? limit
					: LIMITS.maxAccountEventsPerPage,
		});
	return events as StoredAccountEvent[];
};
