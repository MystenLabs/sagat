// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	check,
	index,
	integer,
	pgTable,
	primaryKey,
	serial,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	varchar,
	type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { ValidationError } from '../errors';

export enum ProposalStatus {
	PENDING = 0,
	CANCELLED = 1,
	SUCCESS = 2,
	FAILURE = 3,
}

export const proposalStatusFromString = (
	status: string,
) => {
	switch (status) {
		case 'PENDING':
			return ProposalStatus.PENDING;
		case 'SUCCESS':
			return ProposalStatus.SUCCESS;
		case 'FAILURE':
			return ProposalStatus.FAILURE;
		case 'CANCELLED':
			return ProposalStatus.CANCELLED;
	}
	throw new ValidationError('Invalid status');
};

// Lifecycle of a signer set within an account (`account_signer_sets.status`).
export const AccountSignerSetStatus = {
	DRAFT: 'draft',
	INVITING: 'inviting',
	VERIFIED: 'verified',
	ABANDONED: 'abandoned',
} as const;

export type AccountSignerSetStatus =
	(typeof AccountSignerSetStatus)[keyof typeof AccountSignerSetStatus];

const accountSignerSetStatuses = Object.values(
	AccountSignerSetStatus,
) as [AccountSignerSetStatus, ...AccountSignerSetStatus[]];

// Allowed values of every `network` column in the account rotation tables.
const networkCheck = (name: string, column: AnyPgColumn) =>
	check(
		name,
		sql`${column} IN ('mainnet', 'testnet', 'devnet', 'localnet')`,
	);

// Accounts: the on-chain addresses that own assets and are the `sender` of
// proposals. Network-agnostic identity.
const accounts = pgTable('accounts', {
	address: text('address').notNull().primaryKey(),
	name: varchar('name', { length: 255 }),
	createdAt: timestamp('created_at')
		.notNull()
		.default(sql`NOW()`),
});

// Signer sets: a composition (public keys, weights, threshold). The address is
// derived from the composition, so it is immutable.
const signerSets = pgTable('signer_sets', {
	// The address (combined) of the signer set
	address: text('address').notNull().primaryKey(),
	isVerified: boolean('is_verified')
		.default(false)
		.notNull(),
	threshold: integer('threshold').notNull(),
	// Kept for the legacy routes, which return it as the multisig name.
	name: varchar('name', { length: 255 }),
});

// Store the members of a signer set and their weight.
const signerSetMembers = pgTable(
	'signer_set_members',
	{
		// The signer set address
		signerSetAddress: text('signer_set_address')
			.notNull()
			.references(() => signerSets.address),
		// The public key of the member. This is always a `sui` public key (includes flag!)
		publicKey: text('public_key')
			.notNull()
			.references(() => addresses.publicKey),
		// The weight of the member
		weight: integer('weight').default(1).notNull(),
		// Whether the member has accepted the invitation
		isAccepted: boolean('is_accepted')
			.default(false)
			.notNull(),
		// Whether the member has rejected the invitation
		isRejected: boolean('is_rejected')
			.default(false)
			.notNull(),
		// order of the member in the composition
		order: integer('order').notNull(),
	},
	// We only allow a pub key once per signer set address
	(table) => [
		uniqueIndex('signer_set_member_idx').on(
			table.signerSetAddress,
			table.publicKey,
		),
		index('signer_set_member_signer_set_address_idx').on(
			table.signerSetAddress,
		),
		index('signer_set_member_public_key_idx').on(
			table.publicKey,
		),
	],
);

// Save a table of `pubKey -> address` to make lookups easier.
const addresses = pgTable(
	'addresses',
	{
		// The public key of the address. This is always a `sui` public key (includes flag!)
		publicKey: text('public_key').notNull().primaryKey(),
		address: text('address').notNull().unique(),
	},
	(table) => [
		uniqueIndex('addresses_address_idx').on(table.address),
	],
);

const proposals = pgTable(
	'proposals',
	{
		// The id of the proposal (sequential, so we can keep ordering)
		id: serial('id').primaryKey(),
		// The account address (the sender of the transaction).
		accountAddress: text('account_address')
			.notNull()
			.references(() => accounts.address),
		// the digest of the proposed transaction (avoid duplicates)
		digest: text('digest').notNull().unique(),
		// The status of the proposal.
		status: smallint('status')
			.notNull()
			.default(ProposalStatus.PENDING),
		// The tx bytes of the proposed transaction.
		transactionBytes: text('transaction_bytes').notNull(),
		// The address of the proposer.
		proposerAddress: text('proposer_address').notNull(),
		// A description for the proposal.
		description: varchar('description', { length: 1000 }),
		// the network of the proposal
		network: text('network').notNull(),
		// The creation time of the proposal.
		createdAt: timestamp('created_at')
			.notNull()
			.default(sql`NOW()`),
		// The address of the signer set used at execution.
		executedVia: text('executed_via'),
	},
	(table) => [
		index('proposals_addr_network_idx').on(
			table.accountAddress,
			table.network,
		),
		index('proposals_account_address_idx').on(
			table.accountAddress,
		),
		index('proposals_digest_idx').on(table.digest),
	],
);

// Store the signatures for a proposal.
const proposalSignatures = pgTable(
	'proposal_signatures',
	{
		proposalId: integer('proposal_id')
			.notNull()
			.references(() => proposals.id),
		publicKey: text('public_key')
			.notNull()
			.references(() => addresses.publicKey),
		signature: text('signature').notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.proposalId, table.publicKey],
		}),
	],
);

// Store extra proposers for a given account.
// Proposers can propose transactions for an account.
const accountProposers = pgTable(
	'account_proposers',
	{
		accountAddress: text('account_address')
			.notNull()
			.references(() => accounts.address),
		address: text('address').notNull(),
		addedBy: text('added_by').notNull(),
		addedAt: timestamp('added_at')
			.notNull()
			.default(sql`NOW()`),
	},
	(table) => [
		primaryKey({
			columns: [table.accountAddress, table.address],
		}),
	],
);

// Mirror of the on-chain alias set of an account, per network.
// Written only by the alias refresh function; the chain is the source of truth.
const accountAliases = pgTable(
	'account_aliases',
	{
		accountAddress: text('account_address')
			.notNull()
			.references(() => accounts.address),
		network: text('network').notNull(),
		aliasAddress: text('alias_address').notNull(),
	},
	(table) => [
		primaryKey({
			columns: [
				table.accountAddress,
				table.network,
				table.aliasAddress,
			],
		}),
		networkCheck(
			'account_aliases_network_check',
			table.network,
		),
	],
);

// What the last alias refresh saw for an account on a network. No row means
// the network was never refreshed; `exists = false` means the account never
// called `enable` there, so its alias set is `{account}`.
// Written only by the alias refresh function.
const accountAliasState = pgTable(
	'account_alias_state',
	{
		accountAddress: text('account_address')
			.notNull()
			.references(() => accounts.address),
		network: text('network').notNull(),
		exists: boolean('exists').notNull(),
		// Version of the `AddressAliases` object, null when it does not exist.
		observedVersion: bigint('observed_version', {
			mode: 'number',
		}),
		observedAt: timestamp('observed_at').notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.accountAddress, table.network],
		}),
		networkCheck(
			'account_alias_state_network_check',
			table.network,
		),
	],
);

// The link between an account and a signer set: one row per pair, for the
// facts that belong to the pair (label, who drafted it, draft status). A
// composition can be shared by several accounts, so these do not live on
// `signer_sets`. Whether the set is valid on a network is not stored here:
// it comes from the alias mirror at read time. Every account has a row for
// its original composition (the account address itself): `verified` or
// `inviting`, from that signer set's `is_verified`.
const accountSignerSets = pgTable(
	'account_signer_sets',
	{
		accountAddress: text('account_address')
			.notNull()
			.references(() => accounts.address),
		signerSetAddress: text('signer_set_address')
			.notNull()
			.references(() => signerSets.address),
		// A label for the signer set within the account (e.g. "Operations").
		label: varchar('label', { length: 255 }),
		status: text('status', {
			enum: accountSignerSetStatuses,
		})
			.notNull()
			.default(AccountSignerSetStatus.DRAFT),
		draftedBy: text('drafted_by').notNull(),
		createdAt: timestamp('created_at')
			.notNull()
			.default(sql`NOW()`),
	},
	(table) => [
		primaryKey({
			columns: [
				table.accountAddress,
				table.signerSetAddress,
			],
		}),
		check(
			'account_signer_sets_status_check',
			sql`${table.status} IN (${sql.raw(
				accountSignerSetStatuses
					.map((status) => `'${status}'`)
					.join(', '),
			)})`,
		),
	],
);

// A key as one account knows it. Keyed by the account and the public key,
// not by the signer set member row: a key carries over across rotations and
// a composition can be shared by several accounts. Rows are optional; a key
// without a row simply has no label. Written by the create route only, and
// only by a member; there is no update route. Drafting a new signer set
// during rotation (phase 3) is meant to be the second entry point. Later
// columns (role, last active, link to a person) are each nullable additions.
const accountKeys = pgTable(
	'account_keys',
	{
		accountAddress: text('account_address')
			.notNull()
			.references(() => accounts.address),
		publicKey: text('public_key')
			.notNull()
			.references(() => addresses.publicKey),
		// What this account calls the key (e.g. "Alice's Ledger"). Short on
		// purpose: it sits next to a key in lists.
		label: varchar('label', { length: 64 }),
		updatedBy: text('updated_by').notNull(),
		updatedAt: timestamp('updated_at')
			.notNull()
			.default(sql`NOW()`),
	},
	(table) => [
		primaryKey({
			columns: [table.accountAddress, table.publicKey],
		}),
	],
);

// Export re-usable types.

export const SchemaAddresses = addresses;
export const SchemaAccounts = accounts;
export const SchemaSignerSets = signerSets;
export const SchemaSignerSetMembers = signerSetMembers;
export const SchemaProposals = proposals;
export const SchemaProposalSignatures = proposalSignatures;
export const SchemaAccountProposers = accountProposers;
export const SchemaAccountAliases = accountAliases;
export const SchemaAccountAliasState = accountAliasState;
export const SchemaAccountSignerSets = accountSignerSets;
export const SchemaAccountKeys = accountKeys;

export type Proposal = typeof proposals.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type SignerSet = typeof signerSets.$inferSelect;
export type SignerSetMember =
	typeof signerSetMembers.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type ProposalSignature =
	typeof proposalSignatures.$inferSelect;
export type AccountProposer =
	typeof accountProposers.$inferSelect;
export type AccountAlias =
	typeof accountAliases.$inferSelect;
export type AccountAliasState =
	typeof accountAliasState.$inferSelect;
export type AccountSignerSet =
	typeof accountSignerSets.$inferSelect;
export type AccountKey = typeof accountKeys.$inferSelect;

export type ProposalWithSignatures = Proposal & {
	signatures: ProposalSignature[];
};

// A signer set with its members. Proposers belong to accounts, see
// `AccountProposersDataLoader`.
export type SignerSetWithMembers = SignerSet & {
	members: SignerSetMember[];
	totalMembers: number;
	totalWeight: number;
};
