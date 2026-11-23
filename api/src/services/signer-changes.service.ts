// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// See "Changing signers" in `design/account-rotation.md`.

import {
	checkSignerChange,
	isProofMet,
	namedChain,
	readCompositionNote,
	SignerChangeError,
	signersWhoStay,
	type CompositionNote,
	type SignerChange,
	type SignerSetEntry,
} from '@mysten/sagat';
import { type PublicKey } from '@mysten/sui/cryptography';
import {
	Transaction,
	type TransactionData,
} from '@mysten/sui/transactions';

import {
	AccountSignerSetStatus,
	ProposalStatus,
	SchemaAccountKeys,
	SchemaAccountSignerSets,
	SchemaSignerSetMembers,
	SchemaSignerSets,
} from '../db/schema';
import { type DatabaseTransaction } from '../db/transaction';
import { ApiAuthError, ValidationError } from '../errors';
import {
	getSuiClient,
	type SuiNetwork,
} from '../utils/client';
import { parsePublicKey } from '../utils/pubKey';
import { normalizeKeyLabels } from './account-keys.service';
import { registerPublicKeys } from './addresses.service';
import { validateQuorum } from './multisig.service';
import { findAliasProposals } from './onchain-outcomes.service';
import {
	actingSetsOn,
	mirroredAliasSet,
	resolveAccountSigners,
} from './signers.service';

type TransactionInput = Pick<
	TransactionData,
	'commands' | 'inputs' | 'sender' | 'expiration'
>;

const refusalOf = (error: unknown) => {
	if (!(error instanceof SignerChangeError)) return error;
	if (error.reason === 'before')
		return new ValidationError(
			'The signers of this account changed since the signer change was built. Build it again from the current signers.',
		);
	return new ValidationError(
		`This is not a valid signer change: ${error.message}.`,
	);
};

// A note that does not check (rules 1 and 2) is a `ValidationError`.
export const signerChangeNote = (
	data: TransactionInput,
): CompositionNote | null => {
	try {
		return readCompositionNote(data);
	} catch (error) {
		throw refusalOf(error);
	}
};

export type StoredSignerChange = {
	// Null when the note does not check.
	change: SignerChange | null;
	ready: boolean;
};

// Checked against the note's own `before`, so the answer never moves with the mirror.
export const signerChangeIn = (
	transactionBytes: string,
): Pick<StoredSignerChange, 'change'> | null => {
	let data: TransactionData;
	try {
		data = Transaction.from(transactionBytes).getData();
	} catch {
		return null;
	}
	try {
		const note = readCompositionNote(data);
		if (!note) return null;
		return { change: checkSignerChange(data, note.before) };
	} catch {
		return { change: null };
	}
};

export const addedSetOf = (
	note: CompositionNote,
): SignerSetEntry | null => {
	const add = note.calls.find((c) => c.function === 'add');
	// The reader requires the added set's composition.
	return add
		? (note.signerSets.find(
				(e) => e.address === add.alias,
			) as SignerSetEntry)
		: null;
};

// Aligned with the added set's members in note order; only a change that adds a set takes them.
export const signerChangeLabels = (
	note: CompositionNote | null,
	labels: unknown,
): (string | null)[] => {
	if (labels === undefined || labels === null) return [];
	const added = note && addedSetOf(note);
	if (!added)
		throw new ValidationError(
			'labels are taken only for a signer change that adds a signer set.',
		);
	return normalizeKeyLabels(labels, added.members.length);
};

// One read per network for the life of the process; a failed read is tried again.
const chainIdentifiers = new Map<
	SuiNetwork,
	Promise<string>
>();

export const chainIdentifierOf = (
	network: SuiNetwork,
): Promise<string> => {
	let identifier = chainIdentifiers.get(network);
	if (!identifier) {
		identifier = getSuiClient(network)
			.getChainIdentifier()
			.then((result) => result.chainIdentifier);
		identifier.catch(() =>
			chainIdentifiers.delete(network),
		);
		chainIdentifiers.set(network, identifier);
	}
	return identifier;
};

// A signer change must name the chain the API's node reports for the network.
export const assertNamesChain = async (
	data: TransactionInput,
	network: SuiNetwork,
) => {
	const chain = namedChain(data);
	if (chain === null)
		throw new ValidationError(
			'A signer change must name its chain in the transaction’s expiration.',
		);
	if (chain !== (await chainIdentifierOf(network)))
		throw new ValidationError(
			`This signer change names another chain than ${network}.`,
		);
};

export const currentEpochOf = async (network: SuiNetwork) =>
	BigInt(
		(await getSuiClient(network).getCurrentSystemState())
			.systemState.epoch,
	);

const lastEpochOf = ({
	expiration,
}: Pick<TransactionData, 'expiration'>) => {
	const last =
		expiration?.Epoch ??
		(expiration?.ValidDuring ?? expiration?.Validity)
			?.maxEpoch;
	return last === undefined || last === null
		? null
		: BigInt(last);
};

// A signer change expires by the end of the epoch after `epoch`, with one epoch of slack for a client's node ahead of the API's.
export const assertExpiresSoon = (
	data: Pick<TransactionData, 'expiration'>,
	epoch: bigint,
) => {
	const last = lastEpochOf(data);
	if (last === null || last > epoch + 2n)
		throw new ValidationError(
			'A signer change must expire by the end of the next epoch. Build it again.',
		);
};

// One alias proposal at a time per account and network; one expired before `epoch` no longer counts.
export const assertNoPendingAliasProposal = async (
	tx: DatabaseTransaction,
	accountAddress: string,
	network: SuiNetwork,
	epoch: bigint,
) => {
	const pending = (
		await findAliasProposals(tx, accountAddress, network, [
			ProposalStatus.PENDING,
		])
	).filter((proposal) => {
		const last = lastEpochOf(
			Transaction.from(proposal.transactionBytes).getData(),
		);
		return last === null || last >= epoch;
	});
	if (pending.length > 0)
		throw new ValidationError(
			`Another proposal that changes who controls this account on ${network} is pending (${pending[0].digest}). Execute or cancel it first.`,
		);
};

// Runs under the account lock, in the transaction that inserts the proposal.
export const checkAndWriteSignerChange = async (
	tx: DatabaseTransaction,
	{
		accountAddress,
		network,
		data,
		note,
		proposer,
		labels,
	}: {
		accountAddress: string;
		network: SuiNetwork;
		data: TransactionInput;
		note: CompositionNote;
		proposer: PublicKey;
		// From `signerChangeLabels`.
		labels: (string | null)[];
	},
) => {
	let change: ReturnType<typeof checkSignerChange>;
	try {
		change = checkSignerChange(
			data,
			await mirroredAliasSet(tx, accountAddress, network),
		);
	} catch (error) {
		throw refusalOf(error);
	}

	const signers = await resolveAccountSigners(
		accountAddress,
		actingSetsOn(network),
		tx,
	);
	const oldSet = signers?.actingSets.find(
		(set) => set.address === change.oldSet.address,
	);
	if (!oldSet)
		throw new ValidationError(
			`The signer set this change replaces, ${change.oldSet.address}, is not one the API can identify as acting for the account on ${network}.`,
		);

	// Checked before who stays, which needs a new set to stay in.
	if (change.newSets.length === 0)
		throw new ValidationError(
			'The change leaves no signer set the API can identify acting for the account.',
		);
	const accepted = oldSet.members
		.filter((member) => member.answer === 'accepted')
		.map((member) => member.publicKey);
	const key = proposer.toSuiPublicKey();
	if (
		!accepted.includes(key) ||
		!change.newSets.some((set) =>
			signersWhoStay(change.oldSet, set).includes(key),
		)
	)
		throw new ApiAuthError('NotASignerWhoStays');

	const added = addedSetOf(note);
	if (added)
		await validateQuorum(
			added.members.map((member) =>
				parsePublicKey(member.publicKey).toSuiAddress(),
			),
			added.members.map((member) => member.weight),
			added.threshold,
		);
	if (!isProofMet(change, accepted))
		throw new ValidationError(
			'The signers who stay cannot meet the new threshold by themselves, counting only those who have accepted the account. Add new signers in one change and remove old ones in another.',
		);

	if (!added) return;
	await writeAddedSet(tx, {
		accountAddress,
		added,
		draftedBy: proposer.toSuiAddress(),
	});

	// Only keys new to the account; a key it knows keeps its row.
	const staying = new Set(
		signersWhoStay(change.oldSet, added),
	);
	const newLabels = added.members.flatMap(
		({ publicKey }, index) => {
			const label = labels[index] ?? null;
			return label === null || staying.has(publicKey)
				? []
				: [{ publicKey, label }];
		},
	);
	if (newLabels.length > 0)
		await tx
			.insert(SchemaAccountKeys)
			.values(
				newLabels.map(({ publicKey, label }) => ({
					accountAddress,
					publicKey,
					label,
					updatedBy: proposer.toSuiAddress(),
				})),
			)
			.onConflictDoNothing();
};

// A composition or link that exists is left as it is.
const writeAddedSet = async (
	tx: DatabaseTransaction,
	{
		accountAddress,
		added,
		draftedBy,
	}: {
		accountAddress: string;
		added: SignerSetEntry;
		draftedBy: string;
	},
) => {
	await registerPublicKeys(
		added.members.map((member) =>
			parsePublicKey(member.publicKey),
		),
		tx,
	);

	const [inserted] = await tx
		.insert(SchemaSignerSets)
		.values({
			address: added.address,
			threshold: added.threshold,
			isVerified: false,
		})
		.onConflictDoNothing({
			target: SchemaSignerSets.address,
		})
		.returning({ address: SchemaSignerSets.address });
	if (inserted)
		await tx.insert(SchemaSignerSetMembers).values(
			added.members.map((member, order) => ({
				signerSetAddress: added.address,
				publicKey: member.publicKey,
				weight: member.weight,
				order,
			})),
		);

	await tx
		.insert(SchemaAccountSignerSets)
		.values({
			accountAddress,
			signerSetAddress: added.address,
			status: AccountSignerSetStatus.INVITING,
			draftedBy,
		})
		.onConflictDoNothing();
};
