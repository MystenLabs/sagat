// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Each flow refreshes the alias state it decides on first.

import { PersonalMessages } from '@mysten/sagat';
import { type PublicKey } from '@mysten/sui/cryptography';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../db';
import {
	ProposalStatus,
	SchemaAccounts,
	SchemaProposals,
} from '../db/schema';
import { ApiAuthError, CommonError } from '../errors';
import {
	aliasSetLoaders,
	type AliasSetLoaders,
} from '../loaders/alias-set.loader';
import { type SuiNetwork } from '../utils/client';
import { compareStrings } from '../utils/collections';
import {
	aliasObjectExists,
	refreshStaleAliases,
	requireFreshAliases,
} from './aliases.service';
import { validateIsoExpiry } from './auth.service';
import { answerInvitation } from './invitations.service';
import {
	addProposer,
	getMultisigAccount,
	isCanonicalSuiAddress,
	listActingInvitations,
	listConnections,
	removeProposer,
	type MultisigAccountWithSigners,
} from './multisig.service';
import { findAliasProposals } from './onchain-outcomes.service';
import {
	assertCanonicalSignature,
	verifyMemberSignedMessage,
} from './signatures.service';
import { storedSignerChange } from './signer-changes.service';
import {
	actingSetsOn,
	listRemovedAccounts,
	listTiedAccounts,
	networksWithDifferentSigners,
	type RemovedFromAccount,
} from './signers.service';

// The checked change of a signer change; null for any other proposal.
const signerChangeIn = (transactionBytes: string) =>
	storedSignerChange(transactionBytes, [])?.change ?? null;

// The signer changes that succeeded on the network, oldest first, and the newest pending one.
const signerChangesOf = async (
	address: string,
	network: SuiNetwork,
) => {
	const changes = (
		await findAliasProposals(db, address, network, [
			ProposalStatus.SUCCESS,
			ProposalStatus.PENDING,
		])
	)
		.filter((proposal) =>
			signerChangeIn(proposal.transactionBytes),
		)
		.sort((a, b) => a.id - b.id);
	// The newest: an older one still pending has expired.
	const open = changes
		.filter(
			(proposal) =>
				proposal.status === ProposalStatus.PENDING,
		)
		.at(-1);
	return {
		signerChanges: changes
			.filter(
				(proposal) =>
					proposal.status === ProposalStatus.SUCCESS,
			)
			.map(({ digest }) => ({ digest })),
		openSignerChange: open ? { digest: open.digest } : null,
	};
};

export type RemovedAccount = RemovedFromAccount & {
	// Null unless the event's digest is a signer change of the account whose old set is the removed one.
	transactionDigest: string | null;
};

const withTransactionDigests = async (
	removed: RemovedFromAccount[],
	network: SuiNetwork,
): Promise<RemovedAccount[]> => {
	const digests = [
		...new Set(
			removed.flatMap((entry) =>
				entry.eventDigest ? [entry.eventDigest] : [],
			),
		),
	];
	const proposals =
		digests.length === 0
			? []
			: await db
					.select({
						digest: SchemaProposals.digest,
						accountAddress: SchemaProposals.accountAddress,
						transactionBytes:
							SchemaProposals.transactionBytes,
					})
					.from(SchemaProposals)
					.where(
						and(
							inArray(SchemaProposals.digest, digests),
							eq(SchemaProposals.network, network),
						),
					);
	const oldSetOf = new Map(
		proposals.map((proposal) => [
			proposal.digest,
			{
				accountAddress: proposal.accountAddress,
				oldSet:
					signerChangeIn(proposal.transactionBytes)?.oldSet
						.address ?? null,
			},
		]),
	);
	return removed.map((entry) => {
		const change =
			entry.eventDigest && oldSetOf.get(entry.eventDigest);
		return {
			...entry,
			transactionDigest:
				change &&
				change.accountAddress === entry.accountAddress &&
				change.oldSet === entry.signerSetAddress
					? entry.eventDigest
					: null,
		};
	});
};

// True when the alias read failed and the signers come from the mirror as it was.
export type CheckedAccount = MultisigAccountWithSigners & {
	signerSetsStale: boolean;
};

const keysOf = (callerKeys: PublicKey[]) =>
	callerKeys.map((key) => key.toSuiPublicKey());

export const isAccount = async (address: string) =>
	(
		await db
			.select({ one: sql`1` })
			.from(SchemaAccounts)
			.where(eq(SchemaAccounts.address, address))
			.limit(1)
	).length > 0;

// Returns the accounts whose alias read failed.
const refreshTiedAccounts = async (
	publicKeys: string[],
	network: SuiNetwork,
	accepted: boolean,
	loaders: AliasSetLoaders = aliasSetLoaders,
) => {
	const results = await refreshStaleAliases(
		await listTiedAccounts(publicKeys, network, accepted),
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
		signerSetsStale: unchecked.has(
			account.signerSet.address,
		),
	}));

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
	removed: RemovedAccount[];
}> => {
	const keys = keysOf(callerKeys);
	const unchecked = await refreshTiedAccounts(
		keys,
		network,
		true,
		loaders,
	);
	const [connections, removed] = await Promise.all([
		listConnections({
			callerKeys,
			scope: actingSetsOn(network),
		}),
		listRemovedAccounts(keys, network).then((removed) =>
			withTransactionDigests(removed, network),
		),
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

export const listAccountInvitations = async ({
	callerKeys,
	network,
	showRejected,
}: {
	callerKeys: PublicKey[];
	network: SuiNetwork;
	showRejected: boolean;
}): Promise<CheckedAccount[]> => {
	const keys = keysOf(callerKeys);
	const unchecked = await refreshTiedAccounts(
		keys,
		network,
		false,
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

const OTHER_NETWORKS_WAIT_MS = 2_000;

// One read per network and address while it is in flight.
const otherNetworkReads = new Map<
	string,
	Promise<unknown>
>();
const readOtherNetwork = (
	address: string,
	network: SuiNetwork,
) => {
	const key = `${network}:${address}`;
	let read = otherNetworkReads.get(key);
	if (!read) {
		read = refreshStaleAliases([address], network)
			.catch(() => undefined)
			.finally(() => otherNetworkReads.delete(key));
		otherNetworkReads.set(key, read);
	}
	return read;
};

// `networks` are the supported networks it is compared with.
export const getAccount = async ({
	address,
	network,
	networks,
	callerKeys,
}: {
	address: string;
	network: SuiNetwork;
	networks: SuiNetwork[];
	callerKeys: PublicKey[];
}) => {
	if (!(await isAccount(address)))
		throw new ApiAuthError('NotAnAccountSigner');
	const [state] = await refreshStaleAliases(
		[address],
		network,
	);
	const account = await getMultisigAccount({
		address,
		callerKeys,
		scope: actingSetsOn(network),
	});

	// Only to compare with; a failed or slow read there is ignored.
	let timer: ReturnType<typeof setTimeout> | undefined;
	await Promise.race([
		Promise.all(
			networks
				.filter((other) => other !== network)
				.map((other) => readOtherNetwork(address, other)),
		),
		new Promise((resolve) => {
			timer = setTimeout(resolve, OTHER_NETWORKS_WAIT_MS);
		}),
	]);
	clearTimeout(timer);
	const [signerChangesEnabled, differentOn, changes] =
		await Promise.all([
			state.outcome === 'failed'
				? aliasObjectExists(address, network)
				: state.exists,
			networksWithDifferentSigners(
				address,
				network,
				networks,
			),
			signerChangesOf(address, network),
		]);
	return {
		...account,
		signerSetsStale: state.outcome === 'failed',
		signerChangesEnabled,
		networksWithDifferentSigners: differentOn,
		...changes,
	};
};

// A non-account gets the refusal a non-signer gets, and is never refreshed.
export const refreshAccount = async (
	address: string,
	network: SuiNetwork,
) => {
	if (!(await isAccount(address)))
		throw new ApiAuthError('NotAnAccountSigner');
	await requireFreshAliases(address, network);
};

export const answerAccountInvitation = async ({
	address,
	network,
	answer,
	signature,
	expiry,
}: {
	address: string;
	network: SuiNetwork;
	answer: 'accepted' | 'rejected';
	signature: string;
	expiry: string;
}) => {
	// The signed message names the address as given.
	if (!isCanonicalSuiAddress(address))
		throw new CommonError('InvalidAddress');
	validateIsoExpiry(expiry);
	assertCanonicalSignature(signature);

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
		notMemberError: () =>
			new ApiAuthError('NotAnAccountSigner'),
		beforeMembership: () =>
			refreshAccount(address, network),
	});

	const proof = { version: 1, signature, expiry } as const;
	await answerInvitation({
		accountAddress: address,
		publicKey,
		scopeKind: 'acting',
		...(answer === 'accepted'
			? {
					answer,
					event: {
						action: 'account.accepted',
						proof: { kind: 'account.accept', ...proof },
					},
				}
			: {
					answer,
					event: {
						action: 'account.rejected',
						proof: { kind: 'account.reject', ...proof },
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
};

const changeProposer =
	<R>(
		change: (
			input: Parameters<typeof addProposer>[0],
		) => Promise<R>,
	) =>
	async ({
		address,
		network,
		...signed
	}: AccountProposerChange) =>
		await change({
			address,
			...signed,
			scope: actingSetsOn(network),
			beforeMembership: () =>
				refreshAccount(address, network),
		});

// Adds or re-confirms an external proposer, signed by an accepted key of an acting set.
export const addAccountProposer =
	changeProposer(addProposer);

// Removes an external proposer, and cancels its pending proposals on the network. Returns what it did.
export const removeAccountProposer =
	changeProposer(removeProposer);
