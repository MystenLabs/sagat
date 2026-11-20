// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * A key's answer to an account invitation. See "Accept and reject" in
 * `design/account-rotation.md`.
 */

import { type PublicKey } from '@mysten/sui/cryptography';
import { and, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { LIMITS } from '../constants/limits';
import { db } from '../db';
import {
	AccountSignerSetStatus,
	SchemaAccountAcceptances,
	SchemaAccountSignerSets,
	SchemaAddresses,
	SchemaSignerSetMembers,
	SchemaSignerSets,
	type SignerSet,
} from '../db/schema';
import {
	lockAccount,
	type DatabaseTransaction,
} from '../db/transaction';
import { ValidationError } from '../errors';
import {
	isRecordedSignature,
	recordAccountEvent,
	type AccountEvent,
} from './account-events.service';

// Throws if `publicKey` is already in the maximum number of multisigs, not
// counting the one it is joining. Locks the key's row until `tx` ends.
export const assertKeyBelowMultisigLimit = async (
	tx: DatabaseTransaction,
	publicKey: string,
	joiningSignerSetAddress: string,
) => {
	await tx
		.select({ publicKey: SchemaAddresses.publicKey })
		.from(SchemaAddresses)
		.where(eq(SchemaAddresses.publicKey, publicKey))
		.for('no key update');

	const accepted = await tx.$count(
		SchemaSignerSetMembers,
		and(
			eq(SchemaSignerSetMembers.publicKey, publicKey),
			eq(SchemaSignerSetMembers.isAccepted, true),
			ne(
				SchemaSignerSetMembers.signerSetAddress,
				joiningSignerSetAddress,
			),
		),
	);
	if (accepted >= LIMITS.maxMultisigsPerPublicKey)
		throw new ValidationError(
			'You have reached the maximum number of multisigs for this public key',
		);
};

type EventOf<A extends AccountEvent['action']> =
	Extract<AccountEvent, { action: A }> extends infer E
		? E extends unknown
			? Omit<E, 'accountAddress' | 'actor'>
			: never
		: never;

export type InvitationAnswer =
	| {
			answer: 'accepted';
			event: EventOf<
				'signer_set.accepted' | 'account.accepted'
			>;
	  }
	| {
			answer: 'rejected';
			event: EventOf<
				'signer_set.rejected' | 'account.rejected'
			>;
	  };

const originalMember = alias(
	SchemaSignerSetMembers,
	'original_member',
);
const keyMember = alias(
	SchemaSignerSetMembers,
	'key_member',
);

// Moves the account's links whose composition holds `publicKey` to `verified`
// once every member has accepted this account, and to `inviting` until then.
const recalculateLinks = async (
	tx: DatabaseTransaction,
	accountAddress: string,
	publicKey: string,
) => {
	const unanswered = tx
		.select({ one: sql`1` })
		.from(SchemaSignerSetMembers)
		.leftJoin(
			originalMember,
			and(
				eq(originalMember.signerSetAddress, accountAddress),
				eq(
					originalMember.publicKey,
					SchemaSignerSetMembers.publicKey,
				),
			),
		)
		.leftJoin(
			SchemaAccountAcceptances,
			and(
				eq(
					SchemaAccountAcceptances.accountAddress,
					accountAddress,
				),
				eq(
					SchemaAccountAcceptances.publicKey,
					SchemaSignerSetMembers.publicKey,
				),
			),
		)
		.where(
			and(
				eq(
					SchemaSignerSetMembers.signerSetAddress,
					SchemaAccountSignerSets.signerSetAddress,
				),
				sql`NOT (COALESCE(${originalMember.isAccepted}, false) OR COALESCE(${SchemaAccountAcceptances.isAccepted}, false))`,
			),
		);
	const holdsKey = tx
		.select({ one: sql`1` })
		.from(keyMember)
		.where(
			and(
				eq(
					keyMember.signerSetAddress,
					SchemaAccountSignerSets.signerSetAddress,
				),
				eq(keyMember.publicKey, publicKey),
			),
		);

	await tx
		.update(SchemaAccountSignerSets)
		.set({
			status: sql`CASE WHEN EXISTS (${unanswered}) THEN ${AccountSignerSetStatus.INVITING} ELSE ${AccountSignerSetStatus.VERIFIED} END`,
		})
		.where(
			and(
				eq(
					SchemaAccountSignerSets.accountAddress,
					accountAddress,
				),
				ne(
					SchemaAccountSignerSets.status,
					AccountSignerSetStatus.ABANDONED,
				),
				sql`EXISTS (${holdsKey})`,
			),
		);
};

/**
 * Records `publicKey`'s answer to the account at `accountAddress`, already
 * verified by the caller, and recalculates only that account's links.
 * Returns the account's original signer set as it is after the change.
 */
export const answerInvitation = async ({
	accountAddress,
	publicKey,
	answer,
	event,
}: {
	accountAddress: string;
	publicKey: PublicKey;
} & InvitationAnswer): Promise<SignerSet> => {
	const key = publicKey.toSuiPublicKey();
	const actor = publicKey.toSuiAddress();

	return await db.transaction(async (tx) => {
		// Lock the set first, as creation does, so when its last members accept
		// at once the later one sees the other and verifies the set.
		const [signerSet] = await tx
			.select()
			.from(SchemaSignerSets)
			.where(eq(SchemaSignerSets.address, accountAddress))
			.for('no key update');
		if (!signerSet)
			throw new ValidationError('Multisig not found');

		await lockAccount(tx, accountAddress);

		if (
			await isRecordedSignature(tx, {
				accountAddress,
				signature: event.proof.signature,
				actions: [event.action],
			})
		)
			return signerSet;

		const [member] = await tx
			.select({
				isAccepted: SchemaSignerSetMembers.isAccepted,
				isRejected: SchemaSignerSetMembers.isRejected,
			})
			.from(SchemaSignerSetMembers)
			.where(
				and(
					eq(
						SchemaSignerSetMembers.signerSetAddress,
						accountAddress,
					),
					eq(SchemaSignerSetMembers.publicKey, key),
				),
			);
		const [acceptance] = member
			? []
			: await tx
					.select({
						isAccepted: SchemaAccountAcceptances.isAccepted,
						isRejected: SchemaAccountAcceptances.isRejected,
					})
					.from(SchemaAccountAcceptances)
					.where(
						and(
							eq(
								SchemaAccountAcceptances.accountAddress,
								accountAddress,
							),
							eq(SchemaAccountAcceptances.publicKey, key),
						),
					);
		const current = member ?? acceptance;

		// Accepting again records nothing but still recalculates, as the legacy accept did.
		const changes =
			answer === 'rejected' || !current?.isAccepted;
		if (answer === 'accepted') {
			if (changes)
				await assertKeyBelowMultisigLimit(
					tx,
					key,
					accountAddress,
				);
		} else {
			if (current?.isAccepted)
				throw new ValidationError(
					'Cannot reject after accepting',
				);
			if (current?.isRejected)
				throw new ValidationError(
					'This invitation has already been rejected',
				);
		}

		const state = {
			isAccepted: answer === 'accepted',
			isRejected: answer === 'rejected',
		};
		if (changes && member)
			await tx
				.update(SchemaSignerSetMembers)
				.set(state)
				.where(
					and(
						eq(
							SchemaSignerSetMembers.signerSetAddress,
							accountAddress,
						),
						eq(SchemaSignerSetMembers.publicKey, key),
					),
				);
		else if (changes)
			await tx
				.insert(SchemaAccountAcceptances)
				.values({
					accountAddress,
					publicKey: key,
					...state,
				})
				.onConflictDoUpdate({
					target: [
						SchemaAccountAcceptances.accountAddress,
						SchemaAccountAcceptances.publicKey,
					],
					set: { ...state, answeredAt: sql`now()` },
				});

		await recalculateLinks(tx, accountAddress, key);

		let result = signerSet;
		if (member)
			[result] = await tx
				.update(SchemaSignerSets)
				.set({
					isVerified: sql`NOT EXISTS (${tx
						.select({ one: sql`1` })
						.from(SchemaSignerSetMembers)
						.where(
							and(
								eq(
									SchemaSignerSetMembers.signerSetAddress,
									accountAddress,
								),
								eq(
									SchemaSignerSetMembers.isAccepted,
									false,
								),
							),
						)})`,
				})
				.where(eq(SchemaSignerSets.address, accountAddress))
				.returning();

		if (changes)
			await recordAccountEvent(tx, {
				...event,
				accountAddress,
				actor,
			});
		return result;
	});
};
