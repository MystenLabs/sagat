// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import {
	SIGNATURE_SCHEME_TO_FLAG,
	type PublicKey,
} from '@mysten/sui/cryptography';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import type {
	Transaction,
	TransactionData,
} from '@mysten/sui/transactions';
import {
	isValidSuiAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';

import {
	buildAdd,
	buildRemove,
	decodePure,
	deriveAliasesObjectId,
	findAliasCalls,
	MAX_ALIASES,
} from './aliases.js';

/** A signer set: threshold, and public keys with weights, in order. */
export interface Composition {
	threshold: number;
	members: readonly { publicKey: string; weight: number }[];
}

export interface SignerChangeEntry {
	type: 'signer_change';
	version: 1;
	account: string;
	before: string[];
	after: string[];
}

/** One composition note input per address in `before` ∪ `after`: a signer set's composition, or an address with no details. */
export type NoteEntry =
	| {
			type: 'signer_set';
			version: 1;
			address: string;
			threshold: number;
			members: { publicKey: string; weight: number }[];
	  }
	| {
			type: 'other_signer_set';
			version: 1;
			address: string;
	  };
export type SignerSetEntry = Extract<
	NoteEntry,
	{ type: 'signer_set' }
>;

export type SignerChangeErrorReason =
	/** The transaction carries no composition note. */
	| 'no_note'
	/** A note input is not exactly what the builder writes. */
	| 'not_canonical'
	/** An input that neither a command nor the note uses. */
	| 'extra_input'
	/** Not one `signer_change` input, or the set inputs don't match `before` ∪ `after`. */
	| 'entries'
	/** The commands are not the alias calls of one signer change. */
	| 'commands'
	/** The removed set or the added set lacks its composition. */
	| 'composition'
	/** The note's account is not the transaction's sender. */
	| 'account'
	/** A signer set does not rebuild its stated address. */
	| 'address'
	/** `before` is not the alias set. */
	| 'before'
	/** The alias calls cannot apply to the alias set. */
	| 'calls'
	/** `after` does not follow from the alias set and the calls. */
	| 'after';

export class SignerChangeError extends Error {
	constructor(
		readonly reason: SignerChangeErrorReason,
		message: string,
	) {
		super(message);
		this.name = 'SignerChangeError';
	}
}

export type SignerChangeCall = {
	function: 'add' | 'remove';
	alias: string;
};

/** A composition note read from a transaction, with rules 1 and 2 checked. */
export interface CompositionNote {
	account: string;
	/** The alias set before, as the note states it. */
	before: string[];
	/** The alias set after, as the note states it. */
	after: string[];
	/** The transaction's alias calls, in command order. */
	calls: SignerChangeCall[];
	signerSets: NoteEntry[];
	/** The set the calls remove. */
	removed: SignerSetEntry;
	/** The set the calls add; null for a change that only removes. */
	added: SignerSetEntry | null;
}

/** A signer change checked against an alias set. */
export interface SignerChange {
	before: string[];
	after: string[];
	/** The set the change removes. */
	oldSet: SignerSetEntry;
	/** The set the change adds; null for a change that only removes. */
	added: SignerSetEntry | null;
	/** The added set, or for a change that only removes, every composition left in `after`. */
	newSets: SignerSetEntry[];
}

type TransactionInput = Pick<
	TransactionData,
	'commands' | 'inputs' | 'sender'
>;

const NOTE_TYPES = new Set([
	'signer_change',
	'signer_set',
	'other_signer_set',
]);

const sortedSet = (addresses: readonly string[]) =>
	[
		...new Set(
			addresses.map((a) => normalizeSuiAddress(a)),
		),
	].sort();

const sameSet = (
	a: readonly string[],
	b: readonly string[],
) => a.length === b.length && a.every((x, i) => x === b[i]);

// Fresh objects in a fixed field order, so extra fields never reach the text.
function entryText(
	entry: SignerChangeEntry | NoteEntry,
): string {
	switch (entry.type) {
		case 'signer_change':
			return JSON.stringify({
				type: entry.type,
				version: 1,
				account: entry.account,
				before: entry.before,
				after: entry.after,
			});
		case 'signer_set':
			return JSON.stringify({
				type: entry.type,
				version: 1,
				address: entry.address,
				threshold: entry.threshold,
				members: entry.members.map((m) => ({
					publicKey: m.publicKey,
					weight: m.weight,
				})),
			});
		case 'other_signer_set':
			return JSON.stringify({
				type: entry.type,
				version: 1,
				address: entry.address,
			});
	}
}

function parseKey(value: string): PublicKey {
	const key = publicKeyFromSuiBytes(value);
	if (key.flag() === SIGNATURE_SCHEME_TO_FLAG.MultiSig)
		throw new Error('A multisig key is a signer set');
	return key;
}

const multisigOf = (composition: Composition) =>
	MultiSigPublicKey.fromPublicKeys({
		threshold: composition.threshold,
		publicKeys: composition.members.map((m) => ({
			publicKey: parseKey(m.publicKey),
			weight: m.weight,
		})),
	});

function knownEntry(
	composition: Composition,
): SignerSetEntry {
	return {
		type: 'signer_set',
		version: 1,
		address: multisigOf(composition).toSuiAddress(),
		threshold: composition.threshold,
		members: composition.members.map((m) => ({
			publicKey: parseKey(m.publicKey).toSuiPublicKey(),
			weight: m.weight,
		})),
	};
}

/** The change, then one input per address in `before` ∪ `after`, ascending; each a `tx.pure.string`. */
export function compositionNote({
	account,
	before,
	after,
	known,
}: {
	account: string;
	before: readonly string[];
	after: readonly string[];
	known: readonly Composition[];
}): string[] {
	const byAddress = new Map<string, NoteEntry>();
	for (const signer of known) {
		const entry = knownEntry(signer);
		if (!byAddress.has(entry.address))
			byAddress.set(entry.address, entry);
	}
	const change: SignerChangeEntry = {
		type: 'signer_change',
		version: 1,
		account: normalizeSuiAddress(account),
		before: sortedSet(before),
		after: sortedSet(after),
	};
	return [
		entryText(change),
		...sortedSet([...before, ...after]).map((address) =>
			entryText(
				byAddress.get(address) ?? {
					type: 'other_signer_set',
					version: 1,
					address,
				},
			),
		),
	];
}

export interface SignerChangeInput {
	account: string;
	/** The account's alias set, from a source the caller picks. */
	aliases: readonly string[];
	/** Address of the signer set the change replaces. */
	oldSet: string;
	newSet: Composition;
	/** Every composition the caller knows for the aliases. Must include the old set. */
	known: readonly Composition[];
	/** The chain identifier the expiration names. */
	chain: string;
	epoch: string | number | bigint;
}

/** `tx`'s sender is the account; adds an expiration that names the chain. */
export function buildSignerChange(
	tx: Transaction,
	input: SignerChangeInput,
) {
	const account = normalizeSuiAddress(input.account);
	const before = sortedSet(input.aliases);
	const oldSet = normalizeSuiAddress(input.oldSet);
	const newSet = knownEntry(input.newSet);

	if (!before.includes(oldSet))
		throw new Error(
			`${oldSet} is not in the alias set of ${account}`,
		);
	if (newSet.address === oldSet)
		throw new Error(
			'The new signer set equals the old one',
		);

	const calls: SignerChangeCall[] = before.includes(
		newSet.address,
	)
		? [{ function: 'remove', alias: oldSet }]
		: before.length >= MAX_ALIASES
			? [
					{ function: 'remove', alias: oldSet },
					{ function: 'add', alias: newSet.address },
				]
			: [
					{ function: 'add', alias: newSet.address },
					{ function: 'remove', alias: oldSet },
				];
	const after = sortedSet([
		...before.filter((a) => a !== oldSet),
		newSet.address,
	]);

	const known = [input.newSet, ...input.known];
	if (
		!known.some(
			(signer) => knownEntry(signer).address === oldSet,
		)
	)
		throw new Error(
			`The composition of ${oldSet} is not known`,
		);

	for (const call of calls) {
		const build =
			call.function === 'add' ? buildAdd : buildRemove;
		build(tx, { account, alias: call.alias });
	}
	for (const text of compositionNote({
		account,
		before,
		after,
		known,
	}))
		tx.pure.string(text);

	// What `@mysten/sui` sets when it resolves one: the node accepts at most two epochs.
	const epoch = BigInt(input.epoch);
	tx.setExpiration({
		ValidDuring: {
			minEpoch: String(epoch),
			maxEpoch: String(epoch + 1n),
			minTimestamp: null,
			maxTimestamp: null,
			chain: input.chain,
			nonce: Math.floor(Math.random() * 2 ** 32),
		},
	});
}

function usedInputs(
	commands: TransactionData['commands'],
): Set<number> {
	const used = new Set<number>();
	const visit = (value: unknown) => {
		if (Array.isArray(value)) value.forEach(visit);
		else if (value && typeof value === 'object') {
			const record = value as Record<string, unknown>;
			if (
				record.$kind === 'Input' &&
				typeof record.Input === 'number'
			)
				used.add(record.Input);
			Object.values(record).forEach(visit);
		}
	};
	visit(commands);
	return used;
}

// The text of a pure input whose JSON names a note type, or null.
function noteText(
	inputs: TransactionData['inputs'],
	index: number,
): string | null {
	const text = decodePure(
		inputs,
		{ $kind: 'Input', Input: index, type: 'pure' },
		bcs.string(),
	);
	if (text === null) return null;
	try {
		const json: unknown = JSON.parse(text);
		return json !== null &&
			typeof json === 'object' &&
			NOTE_TYPES.has(
				(json as { type?: unknown }).type as string,
			)
			? text
			: null;
	} catch {
		return null;
	}
}

function notCanonical(text: string): never {
	throw new SignerChangeError(
		'not_canonical',
		`Note input is not canonical: ${text.slice(0, 200)}`,
	);
}

// The entry the text states, or throws when the builder would not write exactly this text.
function parseEntry(
	text: string,
): SignerChangeEntry | NoteEntry {
	let entry: SignerChangeEntry | NoteEntry;
	try {
		const json = JSON.parse(text) as Record<
			string,
			unknown
		>;
		if (json.version !== 1) notCanonical(text);
		const address = (value: unknown) => {
			if (
				typeof value !== 'string' ||
				!isValidSuiAddress(value)
			)
				notCanonical(text);
			return normalizeSuiAddress(value);
		};
		const addresses = (value: unknown) => {
			if (!Array.isArray(value)) notCanonical(text);
			return sortedSet(value.map(address));
		};
		const integer = (value: unknown) => {
			if (!Number.isSafeInteger(value)) notCanonical(text);
			return value as number;
		};
		const key = (value: unknown) => {
			if (typeof value !== 'string') notCanonical(text);
			return parseKey(value).toSuiPublicKey();
		};
		switch (json.type) {
			case 'signer_change':
				entry = {
					type: 'signer_change',
					version: 1,
					account: address(json.account),
					before: addresses(json.before),
					after: addresses(json.after),
				};
				break;
			case 'signer_set':
				if (!Array.isArray(json.members))
					notCanonical(text);
				entry = {
					type: 'signer_set',
					version: 1,
					address: address(json.address),
					threshold: integer(json.threshold),
					members: json.members.map(
						(m: {
							publicKey?: unknown;
							weight?: unknown;
						}) => ({
							publicKey: key(m?.publicKey),
							weight: integer(m?.weight),
						}),
					),
				};
				break;
			default:
				entry = {
					type: 'other_signer_set',
					version: 1,
					address: address(json.address),
				};
		}
	} catch (error) {
		if (error instanceof SignerChangeError) throw error;
		notCanonical(text);
	}
	if (entryText(entry) !== text) notCanonical(text);
	return entry;
}

function objectIdOf(
	input: TransactionData['inputs'][number] | undefined,
): string | null {
	const id =
		input?.UnresolvedObject?.objectId ??
		input?.Object?.ImmOrOwnedObject?.objectId ??
		input?.Object?.SharedObject?.objectId ??
		input?.Object?.Receiving?.objectId;
	return id ? normalizeSuiAddress(id) : null;
}

/** Null without alias calls or a note input; throws a `SignerChangeError` for a malformed change or one failing rule 1 (the account is the sender) or 2 (each set rebuilds its address). */
export function readCompositionNote(
	transaction: TransactionInput,
): CompositionNote | null {
	const { commands, inputs } = transaction;
	const aliasCalls = findAliasCalls(transaction);
	if (aliasCalls.length === 0) return null;

	const used = usedInputs(commands);
	const texts: string[] = [];
	const extra: number[] = [];
	inputs.forEach((_, index) => {
		if (used.has(index)) return;
		const text = noteText(inputs, index);
		if (text === null) extra.push(index);
		else texts.push(text);
	});
	if (texts.length === 0) return null;

	const entries = texts.map(parseEntry);
	if (extra.length > 0)
		throw new SignerChangeError(
			'extra_input',
			`Inputs ${extra.join(', ')} are used by no command and are not note inputs`,
		);

	const [change, ...rest] = entries;
	if (change.type !== 'signer_change')
		throw new SignerChangeError(
			'entries',
			'The first note input is not the signer change',
		);
	const signerSets = rest.filter(
		(e): e is NoteEntry => e.type !== 'signer_change',
	);
	if (signerSets.length !== rest.length)
		throw new SignerChangeError(
			'entries',
			'The note has more than one signer change',
		);
	if (
		!sameSet(
			signerSets.map((e) => e.address),
			sortedSet([...change.before, ...change.after]),
		)
	)
		throw new SignerChangeError(
			'entries',
			'The note does not hold exactly one input per address in before and after, in order',
		);

	if (
		!transaction.sender ||
		normalizeSuiAddress(transaction.sender) !==
			change.account
	)
		throw new SignerChangeError(
			'account',
			`The note's account ${change.account} is not the sender`,
		);

	if (commands.length !== aliasCalls.length)
		throw new SignerChangeError(
			'commands',
			'The transaction has commands other than alias calls',
		);
	const aliasesObject = deriveAliasesObjectId(
		change.account,
	);
	const calls: SignerChangeCall[] = [];
	for (const [index, call] of aliasCalls.entries()) {
		const command = commands[index]?.MoveCall;
		const argument = command?.arguments[0];
		if (
			(call.function !== 'add' &&
				call.function !== 'remove') ||
			call.aliases?.length !== 1 ||
			command?.arguments.length !== 2 ||
			command.typeArguments.length !== 0 ||
			argument?.$kind !== 'Input' ||
			objectIdOf(inputs[argument.Input]) !== aliasesObject
		)
			throw new SignerChangeError(
				'commands',
				`Command ${index} is not an add or remove on the account's alias set`,
			);
		calls.push({
			function: call.function,
			alias: call.aliases[0],
		});
	}
	const added = calls.filter((c) => c.function === 'add');
	const removed = calls.filter(
		(c) => c.function === 'remove',
	);
	if (
		removed.length !== 1 ||
		added.length > 1 ||
		added[0]?.alias === removed[0].alias
	)
		throw new SignerChangeError(
			'commands',
			'The commands are not one add and one remove, or one remove',
		);

	const entryOf = (address: string) =>
		signerSets.find((e) => e.address === address);
	const removedSet = entryOf(removed[0].alias);
	if (removedSet?.type !== 'signer_set')
		throw new SignerChangeError(
			'composition',
			`The note does not hold the composition of the removed set ${removed[0].alias}`,
		);
	const addedSet = added[0]
		? entryOf(added[0].alias)
		: null;
	if (addedSet !== null && addedSet?.type !== 'signer_set')
		throw new SignerChangeError(
			'composition',
			`The note does not hold the composition of the added set ${added[0].alias}`,
		);

	for (const entry of signerSets) {
		if (entry.type === 'other_signer_set') continue;
		let address: string | null;
		try {
			address = multisigOf(entry).toSuiAddress();
		} catch {
			address = null;
		}
		if (address !== entry.address)
			throw new SignerChangeError(
				'address',
				`The signer set stated for ${entry.address} does not rebuild that address`,
			);
	}

	return {
		account: change.account,
		before: change.before,
		after: change.after,
		calls,
		signerSets,
		removed: removedSet,
		added: addedSet,
	};
}

/** Throws a `SignerChangeError`. `aliases` come from a node or, once executed, the note's own `before`. */
export function checkSignerChange(
	transaction: TransactionInput,
	aliases: readonly string[],
): SignerChange {
	const note = readCompositionNote(transaction);
	if (!note)
		throw new SignerChangeError(
			'no_note',
			'The transaction carries no composition note',
		);

	const before = sortedSet(aliases);
	if (!sameSet(before, note.before))
		throw new SignerChangeError(
			'before',
			"The note's before is not the alias set",
		);

	const set = new Set(before);
	for (const call of note.calls) {
		if (call.function === 'add') {
			if (set.has(call.alias) || set.size >= MAX_ALIASES)
				throw new SignerChangeError(
					'calls',
					`Cannot add ${call.alias} to the alias set`,
				);
			set.add(call.alias);
		} else {
			if (!set.has(call.alias) || set.size === 1)
				throw new SignerChangeError(
					'calls',
					`Cannot remove ${call.alias} from the alias set`,
				);
			set.delete(call.alias);
		}
	}
	const after = sortedSet([...set]);
	if (!sameSet(after, note.after))
		throw new SignerChangeError(
			'after',
			"The note's after does not follow from the alias set and the calls",
		);

	return {
		before,
		after,
		oldSet: note.removed,
		added: note.added,
		newSets: note.added
			? [note.added]
			: note.signerSets.filter(
					(e): e is SignerSetEntry =>
						e.type === 'signer_set' &&
						after.includes(e.address),
				),
	};
}

/** The public keys of the old set that are also in the new set. */
export function signersWhoStay(
	oldSet: SignerSetEntry,
	newSet: SignerSetEntry,
): string[] {
	const kept = new Set(
		newSet.members.map((m) => m.publicKey),
	);
	return oldSet.members
		.map((m) => m.publicKey)
		.filter((k) => kept.has(k));
}

/** The new set's weight of its members in `keys` (keys that signed, or accepted), whether they stay or are new. */
export function proofWeight(
	newSet: SignerSetEntry,
	keys: readonly string[],
): number {
	const listed = new Set(keys);
	return newSet.members
		.filter((m) => listed.has(m.publicKey))
		.reduce((sum, m) => sum + m.weight, 0);
}

/** Whether members of at least one of the change's new sets have signed for its threshold. */
export function isProofMet(
	change: Pick<SignerChange, 'newSets'>,
	signedKeys: readonly string[],
): boolean {
	return change.newSets.some(
		(set) => proofWeight(set, signedKeys) >= set.threshold,
	);
}

/** `isProofMet`, and the members of any new set that have not signed, in the new sets' order. */
export function signerChangeProof(
	change: Pick<SignerChange, 'newSets'>,
	signedKeys: readonly string[],
): { met: boolean; notSigned: string[] } {
	const signed = new Set(signedKeys);
	return {
		met: isProofMet(change, signedKeys),
		notSigned: [
			...new Set(
				change.newSets.flatMap((set) =>
					set.members.map((m) => m.publicKey),
				),
			),
		].filter((k) => !signed.has(k)),
	};
}

export function namedChain(
	transaction: Pick<TransactionData, 'expiration'>,
): string | null {
	const { expiration } = transaction;
	if (!expiration) return null;
	if (expiration.ValidDuring)
		return expiration.ValidDuring.chain;
	if (expiration.Validity) return expiration.Validity.chain;
	return null;
}
