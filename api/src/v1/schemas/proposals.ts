// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Proposals, and the public view of the signer sets that can execute them.
 * `PublicProposal` is served without a session, so its members carry no key
 * label: keep `PublicSignerSetMember` apart from `SignerSetMember`.
 */

import { z } from '@hono/zod-openapi';

import {
	SignatureSchema,
	SuiAddressSchema,
} from './common';
import {
	ProposalSchema,
	ProposalSignatureSchema,
	SignerSetMemberRowSchema,
	SignerSetRowSchema,
} from './rows';
import { SignerSetSchema } from './signer-sets';

export const ProposalWithSignaturesSchema =
	ProposalSchema.extend({
		signatures: z.array(ProposalSignatureSchema),
	}).openapi('ProposalWithSignatures');

export const PublicSignerSetMemberSchema =
	SignerSetMemberRowSchema.pick({
		publicKey: true,
		weight: true,
		order: true,
	})
		.extend({
			hasSigned: z.boolean().openapi({
				description:
					'Whether this key signed the proposal.',
			}),
		})
		.openapi('PublicSignerSetMember');

export const ProposalSignerSetSchema = z
	.object({
		address: SuiAddressSchema,
		label: SignerSetSchema.shape.label,
		threshold: SignerSetRowSchema.shape.threshold,
		totalWeight: SignerSetSchema.shape.totalWeight,
		currentWeight: z.number().int().openapi({
			description:
				'The sum of the weights of the members that signed.',
		}),
		hasReachedThreshold: z.boolean().openapi({
			description:
				'Whether `currentWeight` reaches `threshold`, so the set can execute the proposal.',
		}),
		members: z.array(PublicSignerSetMemberSchema),
	})
	.openapi('ProposalSignerSet');

export const PublicProposalSchema =
	ProposalWithSignaturesSchema.extend({
		signerSets: z.array(ProposalSignerSetSchema).openapi({
			description:
				"The account's signer sets that are valid on the proposal's network, oldest link first, with its progress in each. Signatures from keys in none of them are kept but count nowhere.",
		}),
	}).openapi('PublicProposal');

export const ProposalPageSchema = z
	.object({
		data: z.array(PublicProposalSchema).openapi({
			description:
				"The proposals, each with its progress in the account's signer sets valid on the network.",
		}),
		hasNextPage: z.boolean(),
		nextCursor: z.string().optional().openapi({
			description:
				'Pass it as `nextCursor` to get the next page. Absent when the page is empty.',
		}),
		perPage: z.number().int(),
	})
	.openapi('ProposalPage');

export const CreateProposalRequestSchema = z
	.object({
		accountAddress: SuiAddressSchema,
		transactionBytes: z.string().openapi({
			description:
				'The fully resolved transaction, base64. Its sender is the account.',
		}),
		signature: SignatureSchema.openapi({
			description:
				"The proposer's signature over the transaction. A member's signature counts as its vote.",
		}),
		description: z
			.string()
			.nullable()
			.optional()
			.openapi({ description: 'What the proposal does.' }),
		network: z.string().openapi({ example: 'mainnet' }),
	})
	.openapi('CreateProposalRequest');

export const VoteProposalRequestSchema = z
	.object({
		signature: SignatureSchema.openapi({
			description:
				"The member's signature over the proposal's transaction.",
		}),
	})
	.openapi('VoteProposalRequest');

export const VoteProposalResponseSchema = z
	.object({
		hasReachedThreshold: z.boolean().openapi({
			description:
				'Whether any signer set has reached its threshold.',
		}),
		readySignerSets: z.array(SuiAddressSchema).openapi({
			description:
				'The signer sets that have reached their threshold.',
		}),
	})
	.openapi('VoteProposalResponse');

export const CancelProposalResponseSchema = z
	.object({
		message: z.string().openapi({
			example: 'Proposal cancelled successfully',
		}),
	})
	.openapi('CancelProposalResponse');

export const VerifyProposalResponseSchema = z
	.object({ verified: z.literal(true) })
	.openapi('VerifyProposalResponse');
