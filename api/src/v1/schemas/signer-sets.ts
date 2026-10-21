// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Accounts and signer sets, as returned to their members. These carry the
 * account's key labels, so they are only used on authenticated routes; the
 * public view of a signer set is in `./proposals.ts`.
 */

import { z } from '@hono/zod-openapi';

import {
	PublicKeySchema,
	SuiAddressSchema,
} from './common';
import {
	AccountProposerSchema,
	AccountRowSchema,
	AccountSignerSetRowSchema,
	SignerSetMemberRowSchema,
	SignerSetRowSchema,
} from './rows';

export const SignerSetMemberSchema =
	SignerSetMemberRowSchema.extend({
		label: z.string().nullable().openapi({
			description:
				'What the account calls this key, or null. Only returned to members.',
			example: "Alice's Ledger",
		}),
	}).openapi('SignerSetMember');

export const SignerSetSchema = z
	.object({
		address: SuiAddressSchema,
		label: AccountSignerSetRowSchema.shape.label.openapi({
			description:
				"The account's label for the signer set, or null.",
			example: 'Operations',
		}),
		status: AccountSignerSetRowSchema.shape.status.openapi({
			description:
				"The signer set's status within the account.",
		}),
		isVerified: SignerSetRowSchema.shape.isVerified.openapi(
			{
				description: 'Whether every member has accepted.',
			},
		),
		threshold: SignerSetRowSchema.shape.threshold,
		totalWeight: z.number().int().openapi({
			description: 'The sum of the member weights.',
		}),
		draftedBy:
			AccountSignerSetRowSchema.shape.draftedBy.openapi({
				description:
					'The address of the key that created the signer set for the account.',
			}),
		createdAt: AccountSignerSetRowSchema.shape.createdAt,
	})
	.openapi('SignerSet');

export const SignerSetWithMembersSchema =
	SignerSetSchema.extend({
		members: z.array(SignerSetMemberSchema),
	}).openapi('SignerSetWithMembers');

export const AccountSchema = AccountRowSchema.extend({
	proposers: z.array(AccountProposerSchema),
	signerSets: z.array(SignerSetWithMembersSchema),
}).openapi('Account');

export const CreateSignerSetRequestSchema = z
	.object({
		publicKeys: z.array(PublicKeySchema).openapi({
			description:
				'The members, in order. The order is part of the signer set address.',
		}),
		weights: z.array(z.number().int()).openapi({
			description:
				'The weight of each member, aligned with `publicKeys`, from 1 to 255.',
		}),
		threshold: z.number().int().openapi({
			description:
				'The total weight a transaction needs, at most the sum of the weights.',
		}),
		name: z.string().optional().openapi({
			description: 'A name for the account.',
		}),
		labels: z
			.array(z.string().nullable())
			.optional()
			.openapi({
				description:
					'What the account calls each key, aligned with `publicKeys`. Null or blank leaves a key unlabelled. Only a member may set them, and only at creation.',
			}),
	})
	.openapi('CreateSignerSetRequest');

export const SignedMessageRequestSchema = z
	.object({
		signature: z.string().openapi({
			description:
				'A signature over the personal message the route verifies.',
		}),
	})
	.openapi('SignedMessageRequest');

export const AddProposerRequestSchema = z
	.object({
		proposer: SuiAddressSchema,
		signature: z.string().openapi({
			description:
				'An accepted member\'s signature over "Adding proposer <proposer> to account <address>. Valid until: <expiry>".',
		}),
		expiry: z.string().openapi({
			description:
				'The expiry in the signed message, an ISO timestamp at most one hour ahead.',
		}),
	})
	.openapi('AddProposerRequest');

export const RemoveProposerRequestSchema = z
	.object({
		signature: z.string().openapi({
			description:
				'An accepted member\'s signature over "Removing proposer <proposer> from account <address>. Valid until: <expiry>".',
		}),
		expiry: z.string().openapi({
			description:
				'The expiry in the signed message, an ISO timestamp at most one hour ahead.',
		}),
	})
	.openapi('RemoveProposerRequest');
