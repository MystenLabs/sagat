// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Response schemas derived from the tables in `db/schema.ts` with
 * drizzle-zod, so a column change shows up in the spec snapshot instead of
 * drifting from the rows the services return.
 *
 * Shapes that join data onto a row (members with their account key labels,
 * signer sets with members) belong in their own module per resource, with a
 * public schema and an authenticated one where they differ: key labels are
 * only ever returned to members, never on an unauthenticated route.
 */

import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import {
	ProposalStatus,
	SchemaAccountProposers,
	SchemaAccounts,
	SchemaAccountSignerSets,
	SchemaAddresses,
	SchemaProposals,
	SchemaProposalSignatures,
	SchemaSignerSetMembers,
	SchemaSignerSets,
} from '../../db/schema';
import {
	PublicKeySchema,
	SuiAddressSchema,
	TimestampSchema,
	TransactionDigestSchema,
} from './common';

// A registered address and its public key.
export const AddressSchema = createSelectSchema(
	SchemaAddresses,
	{
		publicKey: PublicKeySchema,
		address: SuiAddressSchema,
	},
).openapi('Address');

export const AccountRowSchema = createSelectSchema(
	SchemaAccounts,
	{
		address: SuiAddressSchema,
		createdAt: TimestampSchema,
	},
);

export const SignerSetRowSchema = createSelectSchema(
	SchemaSignerSets,
	{ address: SuiAddressSchema },
);

export const SignerSetMemberRowSchema = createSelectSchema(
	SchemaSignerSetMembers,
	{
		signerSetAddress: SuiAddressSchema,
		publicKey: PublicKeySchema,
	},
);

// The link between an account and a signer set.
export const AccountSignerSetRowSchema = createSelectSchema(
	SchemaAccountSignerSets,
	{
		accountAddress: SuiAddressSchema,
		signerSetAddress: SuiAddressSchema,
		draftedBy: SuiAddressSchema,
		createdAt: TimestampSchema,
	},
);

// An external proposer of an account: an address that may propose but not
// vote.
export const AccountProposerSchema = createSelectSchema(
	SchemaAccountProposers,
	{
		accountAddress: SuiAddressSchema,
		address: SuiAddressSchema,
		addedBy: SuiAddressSchema,
		addedAt: TimestampSchema,
	},
).openapi('AccountProposer');

export const ProposalStatusSchema = z
	.enum(ProposalStatus)
	.openapi('ProposalStatus', {
		description:
			'0 pending, 1 cancelled, 2 succeeded on chain, 3 failed on chain.',
	});

export const ProposalSchema = createSelectSchema(
	SchemaProposals,
	{
		accountAddress: SuiAddressSchema,
		digest: TransactionDigestSchema,
		status: ProposalStatusSchema,
		transactionBytes: (schema) =>
			schema.openapi({
				description: 'The built transaction, base64.',
			}),
		proposerAddress: SuiAddressSchema,
		network: (schema) =>
			schema.openapi({ example: 'mainnet' }),
		createdAt: TimestampSchema,
		executedVia: SuiAddressSchema.nullable().openapi({
			description:
				'The address that signed the executed transaction for the account, recorded by verify: a signer set (possibly one the account does not link) or a single key alias. Null until verified.',
		}),
	},
).openapi('Proposal');

export const ProposalSignatureSchema = createSelectSchema(
	SchemaProposalSignatures,
	{
		publicKey: PublicKeySchema,
		signature: (schema) =>
			schema.openapi({
				description:
					"The member's signature over the transaction, base64.",
			}),
	},
).openapi('ProposalSignature');
