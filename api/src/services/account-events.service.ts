// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The account audit log. See "Audit log" in `design/account-rotation.md`.
 *
 * Actions and proof kinds are checked by TypeScript, not a DB CHECK, so a new
 * action needs no migration. The database accepts any action or proof, so this
 * module must stay the only writer.
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

// A personal message is rebuilt from fields, so its text is never stored.
// `proposal.create` signs the proposal's transaction bytes instead.
type SignedProof<
	Kind extends string,
	Fields = unknown,
	Version extends number = 1,
> = {
	kind: Kind;
	version: Version;
	signature: string;
} & Fields;

// For rows nobody signed, such as a chain change. Nothing writes them yet.
export const SYSTEM_ACTOR = 'system';
type ChainProof = { kind: 'chain'; digest: string };

type MemberActor = string;

// A row nobody signed directly. Its authority is the row it points at.
type CausedByProof = { kind: 'caused_by'; eventId: number };

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
	// `actor` is the proposer, member or not. `subject` is the proposal's digest.
	'proposal.created': {
		actor: string;
		subject: string;
		network: string;
		proof: SignedProof<'proposal.create'>;
	};
	// A signed removal of an address that is no proposer but had pending
	// proposals, which it cancelled. Apart from `proposer.removed` so that one
	// only ever means a row was deleted.
	'proposer.removal_unmatched': {
		actor: MemberActor;
		subject: string;
		proof: SignedProof<
			'proposer.remove',
			{ expiry: string }
		>;
	};
	// `actor` is a member, or the external proposer cancelling their own
	// proposal. `subject` is the proposal's digest, which the signed text names
	// with the row's account.
	'proposal.cancelled': {
		actor: string;
		subject: string;
		network: string;
		proof:
			| SignedProof<'proposal.cancel', unknown, 2>
			| CausedByProof;
	};
};

// Written before cancels named the digest; its signed text names the id.
type CancelProofV1 = SignedProof<
	'proposal.cancel',
	{ proposalId: number }
>;

// Every proof in the registry, plus `ChainProof`, which has no entry yet, and
// proofs only older rows hold.
export type AccountEventProof =
	| {
			[A in keyof AccountEventRegistry]: Required<
				AccountEventRegistry[A]
			> extends { proof: infer Proof }
				? NonNullable<Proof>
				: never;
	  }[keyof AccountEventRegistry]
	| ChainProof
	| CancelProofV1;

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
