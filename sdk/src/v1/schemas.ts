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

export const TransactionDigestSchema = z
	.string()
	.refine(isValidTransactionDigest, {
		message: 'The transaction digest provided is invalid.',
	})
	.meta({ description: 'A Sui transaction digest.' });
export type TransactionDigest = z.infer<
	typeof TransactionDigestSchema
>;

export const SuiAddressSchema = z
	.string()
	.refine(isValidSuiAddress, {
		message:
			'Invalid address. Must be a valid Sui address.',
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
		members: z.array(SignerSetMemberSchema),
	})
	.meta({ id: 'SignerSet' });
export type SignerSet = z.infer<typeof SignerSetSchema>;

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
		currentWeight: z.number().int(),
		hasReachedThreshold: z.boolean(),
		signerSet: SignerSetSchema,
	})
	.meta({ id: 'Proposal' });
export type Proposal = z.infer<typeof ProposalSchema>;
