// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// See "Accept and reject" in `design/account-rotation.md`.

import { type PublicKey } from '@mysten/sui/cryptography';
import {
	and,
	eq,
	exists,
	inArray,
	ne,
	sql,
} from 'drizzle-orm';

import { LIMITS } from '../constants/limits';
import { db } from '../db';
import {
	AccountSignerSetStatus,
	SchemaAccountAcceptances,
	SchemaAccounts,
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
import { parsePublicKey } from '../utils/pubKey';
import {
	isRecordedSignature,
	recordAccountEvent,
	type AccountEvent,
} from './account-events.service';
import {
	acceptedAccounts,
	type SignerScopeKind,
} from './signers.service';

// Not counting the account it is joining. Locks the key's row until `tx` ends.
const isKeyAtMultisigLimit = async (
	tx: DatabaseTransaction,
	publicKey: string,
	joiningAccountAddress: string,
) => {
	await tx
		.select({ publicKey: SchemaAddresses.publicKey })
		.from(SchemaAddresses)
		.where(eq(SchemaAddresses.publicKey, publicKey))
		.for('no key update');

	const accepted = acceptedAccounts(tx, [publicKey]);
	const [{ count }] = await tx
		.with(accepted)
		.select({ count: sql<number>`count(*)::int` })
		.from(accepted)
		.where(
			ne(accepted.accountAddress, joiningAccountAddress),
		);
	return count >= LIMITS.maxMultisigsPerPublicKey;
};

export const assertKeyBelowMultisigLimit = async (
	tx: DatabaseTransaction,
	publicKey: string,
	joiningAccountAddress: string,
	scopeKind: SignerScopeKind,
) => {
	if (
		await isKeyAtMultisigLimit(
			tx,
			publicKey,
			joiningAccountAddress,
		)
	)
		throw new ValidationError(
			scopeKind === 'acting'
				? 'You have reached the maximum number of accounts for this public key.'
				: 'You have reached the maximum number of multisigs for this public key',
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

// The key's answer row for the account: its member row in the original set, else its acceptance row.
const readAnswer = async (
	tx: DatabaseTransaction,
	accountAddress: string,
	key: string,
) => {
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
	return { member, current: member ?? acceptance };
};

const writeAnswer = async (
	tx: DatabaseTransaction,
	{
		accountAddress,
		key,
		answer,
		isMember,
	}: {
		accountAddress: string;
		key: string;
		answer: InvitationAnswer['answer'];
		isMember: boolean;
	},
) => {
	const state = {
		isAccepted: answer === 'accepted',
		isRejected: answer === 'rejected',
	};
	if (isMember)
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
	else
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
};

// For a key that signed the executed change that adds it, under the caller's account lock; skips one already accepted or at the limit.
export const acceptAddedKey = async (
	tx: DatabaseTransaction,
	{
		accountAddress,
		key,
		digest,
		network,
		signature,
	}: {
		accountAddress: string;
		key: string;
		digest: string;
		network: string;
		signature: string;
	},
) => {
	const { member, current } = await readAnswer(
		tx,
		accountAddress,
		key,
	);
	if (
		current?.isAccepted ||
		(await isKeyAtMultisigLimit(tx, key, accountAddress))
	)
		return;

	await writeAnswer(tx, {
		accountAddress,
		key,
		answer: 'accepted',
		isMember: !!member,
	});
	await recordAccountEvent(tx, {
		action: 'account.accepted',
		accountAddress,
		actor: parsePublicKey(key).toSuiAddress(),
		subject: digest,
		network,
		proof: {
			kind: 'signer_change.sign',
			version: 1,
			signature,
		},
	});
};

// The caller has verified the answer. Returns the account's original signer set after it.
export const answerInvitation = async ({
	accountAddress,
	publicKey,
	scopeKind,
	answer,
	event,
}: {
	accountAddress: string;
	publicKey: PublicKey;
	scopeKind: SignerScopeKind;
} & InvitationAnswer): Promise<SignerSet> => {
	const key = publicKey.toSuiPublicKey();
	const actor = publicKey.toSuiAddress();

	return await db.transaction(async (tx) => {
		// Lock the set first, as creation does, so the last two to accept at once see each other.
		const [signerSet] = await tx
			.select()
			.from(SchemaSignerSets)
			.where(
				and(
					eq(SchemaSignerSets.address, accountAddress),
					// A signer set with no account at its address takes no answers.
					exists(
						tx
							.select({ one: sql`1` })
							.from(SchemaAccounts)
							.where(
								eq(SchemaAccounts.address, accountAddress),
							),
					),
				),
			)
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

		const { member, current } = await readAnswer(
			tx,
			accountAddress,
			key,
		);

		// Accepting again records nothing but still recalculates, as the legacy accept did.
		const changes =
			answer === 'rejected' || !current?.isAccepted;
		if (answer === 'accepted') {
			if (changes)
				await assertKeyBelowMultisigLimit(
					tx,
					key,
					accountAddress,
					scopeKind,
				);
		} else {
			if (current?.isAccepted)
				throw new ValidationError(
					'Cannot reject after accepting',
				);
			if (current?.isRejected) {
				// `/v1` answers a repeated reject as it answered the first, and changes nothing.
				if (scopeKind === 'acting') return signerSet;
				throw new ValidationError(
					'This invitation has already been rejected',
				);
			}
		}

		if (changes)
			await writeAnswer(tx, {
				accountAddress,
				key,
				answer,
				isMember: !!member,
			});

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
		// Every account linked to the composition sees it verified.
		if (member && result.isVerified)
			await tx
				.update(SchemaAccountSignerSets)
				.set({ status: AccountSignerSetStatus.VERIFIED })
				.where(
					and(
						eq(
							SchemaAccountSignerSets.signerSetAddress,
							accountAddress,
						),
						inArray(SchemaAccountSignerSets.status, [
							AccountSignerSetStatus.DRAFT,
							AccountSignerSetStatus.INVITING,
						]),
					),
				);

		if (changes)
			await recordAccountEvent(tx, {
				...event,
				accountAddress,
				actor,
			});
		return result;
	});
};
