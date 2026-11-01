// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The account audit log: what a change recorded, who authorized it, and the
 * proof a client needs to check that without trusting this server. See "Audit
 * log" in `docs/account-rotation.md`.
 *
 * Auditing a new operation takes one entry in `AccountEventRegistry` and one
 * `recordAccountEvent` call at the write site. Action names and proof kinds
 * are checked by the compiler here, not by a CHECK constraint, so a new action
 * needs no migration. The trade-off: the database itself accepts any action or
 * proof, so this module must stay the only writer.
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

// `kind` and `version` name a message template in the SDK's `PersonalMessages`,
// and a reader rebuilds the signed message from them and the event's fields, so
// message text is never stored. Version 1 is the legacy text. `expiry` is here
// because it is part of the message, not as a validity window for readers.
type ProposerAddProof = {
	kind: 'proposer.add';
	version: 1;
	signature: string;
	expiry: string;
};
type ProposerRemoveProof = {
	kind: 'proposer.remove';
	version: 1;
	signature: string;
	expiry: string;
};

// Room for rows nobody signed, such as a change seen on chain. Nothing writes
// them yet: a system writer adds a registry entry with this actor and proof.
export const SYSTEM_ACTOR = 'system';
type ChainProof = { kind: 'chain'; digest: string };

export type AccountEventProof =
	ProposerAddProof | ProposerRemoveProof | ChainProof;

// The address of the member who signed the proof.
type MemberActor = string;

// What each action stores. A field an entry leaves out must stay unset and is
// stored as NULL. A proof that is not required is written `proof?: X | null`.
// The subject of a proposer event is the address exactly as signed, not
// normalised, because the proof's message has it verbatim.
type AccountEventRegistry = {
	'proposer.added': {
		actor: MemberActor;
		subject: string;
		proof: ProposerAddProof;
	};
	'proposer.removed': {
		actor: MemberActor;
		subject: string;
		proof: ProposerRemoveProof;
	};
};

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

/**
 * Records `event` in the transaction of the change it describes, so the two
 * commit or roll back together. Returns the event's id.
 *
 * Takes the account lock: ids are assigned at insert, not commit, so without
 * it a lower id can become visible after a reader has passed it. With it an
 * account's ids follow commit order, which keyset pagination and a later hash
 * chain rely on. A writer that touches other rows must call `lockAccount`
 * first, or it can deadlock against another writer of the account.
 */
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

// An event as read back. `proof` is only there when the reader asked for it.
export type StoredAccountEvent = Omit<
	AccountEventRow,
	'proof'
> & {
	proof?: AccountEventProof | null;
};

/**
 * An account's events, newest first, for a caller holding an accepted key of
 * it. Keyset pagination: pass the last id of a page as `before` to get the next
 * one. An out-of-range `limit` means the maximum, as it does for proposals.
 */
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
	// `proof` is only ever written through `recordAccountEvent`.
	return events as StoredAccountEvent[];
};
