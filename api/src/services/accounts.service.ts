// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The `/v1` account flows. Each refreshes the alias state it decides on
 * first, then calls the signer set flows under the acting scope.
 */

import { PersonalMessages } from '@mysten/sagat';
import { type PublicKey } from '@mysten/sui/cryptography';
import { eq, sql } from 'drizzle-orm';

import { db } from '../db';
import { SchemaAccounts } from '../db/schema';
import { ApiAuthError, CommonError } from '../errors';
import {
	aliasSetLoaders,
	type AliasSetLoaders,
} from '../loaders/alias-set.loader';
import { type SuiNetwork } from '../utils/client';
import { compareStrings } from '../utils/collections';
import { answerAccount } from './account-answers.service';
import {
	aliasObjectExists,
	refreshStaleAliases,
	requireFreshAliases,
} from './aliases.service';
import { validateIsoExpiry } from './auth.service';
import {
	addProposer,
	getMultisigAccount,
	isCanonicalSuiAddress,
	listActingInvitations,
	listConnections,
	removeProposer,
	type MultisigAccountWithSigners,
} from './multisig.service';
import {
	assertCanonicalSignature,
	verifyMemberSignedMessage,
} from './signatures.service';
import {
	actingSetsOn,
	listRemovedAccounts,
	listTiedAccounts,
	networksWithDifferentSigners,
	type RemovedFromAccount,
} from './signers.service';

// False when the alias read failed and the signers come from the mirror as it was.
export type CheckedAccount = MultisigAccountWithSigners & {
	signersChecked: boolean;
};

const keysOf = (callerKeys: PublicKey[]) =>
	callerKeys.map((key) => key.toSuiPublicKey());

const isAccount = async (address: string) =>
	(
		await db
			.select({ one: sql`1` })
			.from(SchemaAccounts)
			.where(eq(SchemaAccounts.address, address))
			.limit(1)
	).length > 0;

// Refreshes the accounts the keys are tied to, and returns the ones whose read failed.
const refreshTiedAccounts = async (
	publicKeys: string[],
	network: SuiNetwork,
	loaders: AliasSetLoaders,
) => {
	const results = await refreshStaleAliases(
		await listTiedAccounts(publicKeys, network),
		network,
		loaders,
	);
	return new Set(
		results.flatMap((result) =>
			result.outcome === 'failed'
				? [result.accountAddress]
				: [],
		),
	);
};

const checked = (
	accounts: MultisigAccountWithSigners[],
	unchecked: Set<string>,
): CheckedAccount[] =>
	accounts.map((account) => ({
		...account,
		signersChecked: !unchecked.has(
			account.signerSet.address,
		),
	}));

/**
 * The accounts the caller's keys accepted on the network, by address, and
 * the ones a key was removed from there.
 */
export const listAccounts = async ({
	callerKeys,
	network,
	loaders = aliasSetLoaders,
}: {
	callerKeys: PublicKey[];
	network: SuiNetwork;
	loaders?: AliasSetLoaders;
}): Promise<{
	accounts: CheckedAccount[];
	removed: RemovedFromAccount[];
}> => {
	const keys = keysOf(callerKeys);
	const unchecked = await refreshTiedAccounts(
		keys,
		network,
		loaders,
	);
	const [connections, removed] = await Promise.all([
		listConnections({
			callerKeys,
			scope: actingSetsOn(network),
		}),
		listRemovedAccounts(keys, network),
	]);
	const accounts = new Map(
		[...connections.values()]
			.flat()
			.map((account) => [
				account.signerSet.address,
				account,
			]),
	);
	return {
		accounts: checked(
			[...accounts.values()].sort((a, b) =>
				compareStrings(
					a.signerSet.address,
					b.signerSet.address,
				),
			),
			unchecked,
		),
		removed,
	};
};

/**
 * The accounts where a caller's key is in an acting set on the network and
 * has not answered, or with `showRejected`, rejected.
 */
export const listAccountInvitations = async ({
	callerKeys,
	network,
	showRejected,
	loaders = aliasSetLoaders,
}: {
	callerKeys: PublicKey[];
	network: SuiNetwork;
	showRejected: boolean;
	loaders?: AliasSetLoaders;
}): Promise<CheckedAccount[]> => {
	const keys = keysOf(callerKeys);
	const unchecked = await refreshTiedAccounts(
		keys,
		network,
		loaders,
	);
	return checked(
		await listActingInvitations({
			publicKeys: keys,
			showRejected,
			network,
		}),
		unchecked,
	);
};

/**
 * An account, for a key of an acting set on the network, accepted or not.
 * `networks` are the supported networks it is compared with.
 */
export const getAccount = async ({
	address,
	network,
	networks,
	callerKeys,
	loaders = aliasSetLoaders,
}: {
	address: string;
	network: SuiNetwork;
	networks: SuiNetwork[];
	callerKeys: PublicKey[];
	loaders?: AliasSetLoaders;
}) => {
	if (!(await isAccount(address)))
		throw new ApiAuthError('AccessDenied');
	const [state] = await refreshStaleAliases(
		[address],
		network,
		loaders,
	);
	const account = await getMultisigAccount({
		address,
		callerKeys,
		scope: actingSetsOn(network),
	});

	// Only to compare with; a failed read there is ignored.
	await Promise.all(
		networks
			.filter((other) => other !== network)
			.map((other) =>
				refreshStaleAliases(
					[address],
					other,
					loaders,
				).catch(() => undefined),
			),
	);
	const [signerChangesAllowed, differentOn] =
		await Promise.all([
			state.outcome === 'failed'
				? aliasObjectExists(address, network)
				: state.exists,
			networksWithDifferentSigners(
				address,
				network,
				networks,
			),
		]);
	return {
		...account,
		signersChecked: state.outcome !== 'failed',
		signerChangesAllowed,
		networksWithDifferentSigners: differentOn,
	};
};

// A non-account gets the refusal a non-signer gets, and is never refreshed.
const refreshAccount = async (
	address: string,
	network: SuiNetwork,
	notSigner: () => Error,
	loaders: AliasSetLoaders,
) => {
	if (!(await isAccount(address))) throw notSigner();
	await requireFreshAliases(address, network, loaders);
};

/** A key's answer to an account, signed with the message that names it. */
export const answerAccountInvitation = async ({
	address,
	network,
	answer,
	signature,
	expiry,
	loaders = aliasSetLoaders,
}: {
	address: string;
	network: SuiNetwork;
	answer: 'accepted' | 'rejected';
	signature: string;
	expiry: string;
	loaders?: AliasSetLoaders;
}) => {
	// The signed message names the address as given.
	if (!isCanonicalSuiAddress(address))
		throw new CommonError('InvalidAddress');
	validateIsoExpiry(expiry);
	assertCanonicalSignature(signature);

	const notSigner = () =>
		new ApiAuthError('NotAnAccountSigner');
	await refreshAccount(
		address,
		network,
		notSigner,
		loaders,
	);
	const publicKey = await verifyMemberSignedMessage({
		accountAddress: address,
		scope: actingSetsOn(network),
		signature,
		message: (answer === 'accepted'
			? PersonalMessages.acceptAccountInvitation
			: PersonalMessages.rejectAccountInvitation)(
			address,
			expiry,
		),
		acceptedOnly: false,
		notMemberError: notSigner,
	});

	await answerAccount({
		accountAddress: address,
		publicKey,
		...(answer === 'accepted'
			? {
					answer,
					event: {
						action: 'account.accepted',
						proof: {
							kind: 'account.accept',
							version: 1,
							signature,
							expiry,
						},
					},
				}
			: {
					answer,
					event: {
						action: 'account.rejected',
						proof: {
							kind: 'account.reject',
							version: 1,
							signature,
							expiry,
						},
					},
				}),
	});
	return {
		accountAddress: address,
		publicKey: publicKey.toSuiPublicKey(),
		answer,
	};
};

type AccountProposerChange = {
	address: string;
	network: SuiNetwork;
	proposer: string;
	signature: string;
	expiry: string;
	loaders?: AliasSetLoaders;
};

const changeProposer =
	(change: typeof addProposer) =>
	async ({
		address,
		network,
		loaders = aliasSetLoaders,
		...signed
	}: AccountProposerChange) => {
		await refreshAccount(
			address,
			network,
			() => new ApiAuthError('NotAMultisigMember'),
			loaders,
		);
		await change({
			address,
			...signed,
			scope: actingSetsOn(network),
		});
	};

// Adds or re-confirms an external proposer, signed by an accepted key of an acting set.
export const addAccountProposer =
	changeProposer(addProposer);

// Removes an external proposer, and cancels its pending proposals on the network.
export const removeAccountProposer =
	changeProposer(removeProposer);
