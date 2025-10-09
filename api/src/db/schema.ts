import { sql } from 'drizzle-orm';
import {
	boolean,
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

// Multisig addresses table
const multisigs = pgTable(
	'multisigs',
	{
		// The address (combined) of the multisig
		address: text('address').notNull().primaryKey(),
		isVerified: boolean('is_verified')
			.default(false)
			.notNull(),
		threshold: integer('threshold').notNull(),
		name: varchar('name', { length: 255 }),
	},
	(table) => [
		index('multisig_address_idx').on(table.address),
	],
);

// Store the members of a multisig and their weight.
const multisigMembers = pgTable(
	'multisig_members',
	{
		// The multisig address
		multisigAddress: text('multisig_address')
			.notNull()
			.references(() => multisigs.address),
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
		// order of the m
		order: integer('order').notNull(),
	},
	// We only allow a pub key once per multisig address
	(table) => [
		uniqueIndex('multisig_member_idx').on(
			table.multisigAddress,
			table.publicKey,
		),
		index('multisig_member_multisig_address_idx').on(
			table.multisigAddress,
		),
		index('multisig_member_public_key_idx').on(
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
		// The multisig address.
		multisigAddress: text('multisig_address')
			.notNull()
			.references(() => multisigs.address),
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
	},
	(table) => [
		index('proposals_addr_network_idx').on(
			table.multisigAddress,
			table.network,
		),
		index('proposals_multisig_address_idx').on(
			table.multisigAddress,
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

// Store extra proposers for a given multisig.
// Proposers can propose transactions in a multi-sig.
const multisigProposers = pgTable(
	'multisig_proposers',
	{
		multisigAddress: text('multisig_address')
			.notNull()
			.references(() => multisigs.address),
		address: text('address').notNull(),
		addedBy: text('added_by').notNull(),
		addedAt: timestamp('added_at')
			.notNull()
			.default(sql`NOW()`),
	},
	(table) => [
		primaryKey({
			columns: [table.multisigAddress, table.address],
		}),
	],
);

// Export re-usable types.

export const SchemaAddresses = addresses;
export const SchemaMultisigs = multisigs;
export const SchemaMultisigMembers = multisigMembers;
export const SchemaProposals = proposals;
export const SchemaProposalSignatures = proposalSignatures;
export const SchemaMultisigProposers = multisigProposers;

export type Proposal = typeof proposals.$inferSelect;
export type Multisig = typeof multisigs.$inferSelect;
export type MultisigMember =
	typeof multisigMembers.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type ProposalSignature =
	typeof proposalSignatures.$inferSelect;
export type MultisigProposer =
	typeof multisigProposers.$inferSelect;

export type ProposalWithSignatures = Proposal & {
	signatures: ProposalSignature[];
};

export type MultisigWithMembers = Multisig & {
	members: MultisigMember[];
	totalMembers: number;
	totalWeight: number;
	proposers: Omit<MultisigProposer, 'multisigAddress'>[];
};
