// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	isValidSuiAddress,
	isValidTransactionDigest,
} from '@mysten/sui/utils';
import { z } from 'zod';

import { ProposalStatus } from '../types.js';

export const ErrorBodySchema = z
	.object({ error: z.string() })
	.meta({ id: 'Error', description: 'An error response.' });
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

export const ValidationMessages = {
	InvalidDigest:
		'The transaction digest provided is invalid.',
	InvalidAddress:
		'Invalid address. Must be a valid Sui address.',
} as const;

export const TransactionDigestSchema = z
	.string()
	.refine(isValidTransactionDigest, {
		message: ValidationMessages.InvalidDigest,
	})
	.meta({ description: 'A Sui transaction digest.' });
export type TransactionDigest = z.infer<
	typeof TransactionDigestSchema
>;

export const SuiAddressSchema = z
	.string()
	.refine(isValidSuiAddress, {
		message: ValidationMessages.InvalidAddress,
	})
	.meta({ description: 'A Sui address.' });
export type SuiAddress = z.infer<typeof SuiAddressSchema>;

export const ProposalSignatureSchema = z
	.object({
		proposalId: z.number().int(),
		publicKey: z.string(),
		signature: z.string(),
	})
	.meta({ id: 'ProposalSignature' });
export type ProposalSignature = z.infer<
	typeof ProposalSignatureSchema
>;

export const SignerSetMemberSchema = z
	.object({
		publicKey: z.string(),
		weight: z.number().int(),
		order: z.number().int(),
	})
	.meta({ id: 'SignerSetMember' });
export type SignerSetMember = z.infer<
	typeof SignerSetMemberSchema
>;

export const SignerSetSchema = z
	.object({
		address: SuiAddressSchema,
		threshold: z.number().int(),
		currentWeight: z.number().int(),
		hasReachedThreshold: z.boolean(),
		members: z.array(SignerSetMemberSchema),
	})
	.meta({ id: 'SignerSet' });
export type SignerSet = z.infer<typeof SignerSetSchema>;

export const AccountEventSchema = z
	.object({
		id: z.number().int(),
		action: z.string(),
		actor: z.string(),
		subject: z.string().nullable(),
		proof: z
			.record(z.string(), z.unknown())
			.nullable()
			.meta({
				description:
					'The signed proof as stored; older rows can hold older shapes.',
			}),
		createdAt: z.iso.datetime(),
	})
	.meta({
		id: 'AccountEvent',
		description: 'An account audit log event, as stored.',
	});
export type AccountEvent = z.infer<
	typeof AccountEventSchema
>;

export const ProposalEventsSchema = z
	.object({
		// Not `.nullable()`, which makes the shared component nullable in the spec.
		created: AccountEventSchema.or(z.null()).meta({
			description:
				"The proposal's `proposal.created` event.",
		}),
		proposer: AccountEventSchema.or(z.null()).meta({
			description: "The proposer's newest add or remove.",
		}),
	})
	.meta({
		id: 'ProposalEvents',
		description:
			"The proposal's audit log events, for checking who proposed it. Each is null where none exists.",
	});
export type ProposalEvents = z.infer<
	typeof ProposalEventsSchema
>;

export const ProposalSchema = z
	.object({
		id: z.number().int(),
		digest: TransactionDigestSchema,
		accountAddress: SuiAddressSchema,
		accountName: z.string().nullable(),
		network: z.string(),
		status: z.enum(ProposalStatus),
		transactionBytes: z.string(),
		proposerAddress: SuiAddressSchema,
		description: z.string().nullable(),
		createdAt: z.iso.datetime(),
		signatures: z.array(ProposalSignatureSchema),
		hasReachedThreshold: z.boolean().meta({
			description:
				'True when one of the signer sets in signerSets has reached its threshold.',
		}),
		signerSets: z.array(SignerSetSchema).meta({
			description:
				"The signer sets that act for the account on the proposal's network.",
		}),
		events: ProposalEventsSchema,
	})
	.meta({ id: 'Proposal' });
export type Proposal = z.infer<typeof ProposalSchema>;
