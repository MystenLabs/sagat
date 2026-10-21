// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Accounts and signer sets, as returned to their members. These carry the
 * account's key labels, so they are only used on authenticated routes; the
 * public view of a signer set is in `./proposals.ts`.
 */

import { z } from '@hono/zod-openapi';

import {
	NetworkSchema,
	PublicKeySchema,
	SignatureSchema,
	SuiAddressSchema,
	TimestampSchema,
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
		validOn: z.array(NetworkSchema).openapi({
			description:
				'The networks on which the signer set can sign for the account: those whose alias set holds its address. Empty for a draft, or a set retired everywhere.',
		}),
	})
	.openapi('SignerSet');

export const SignerSetWithMembersSchema =
	SignerSetSchema.extend({
		members: z.array(SignerSetMemberSchema),
	}).openapi('SignerSetWithMembers');

export const SignerSetInvitationSchema =
	SignerSetWithMembersSchema.extend({
		accountAddress: SuiAddressSchema.openapi({
			description:
				'The account the signer set is drafted for. A signer set shared by several accounts has one invitation per account.',
		}),
		accountName: AccountRowSchema.shape.name.openapi({
			description: 'The name of that account, or null.',
		}),
	}).openapi('SignerSetInvitation');

// The link fields of a signer set, as one of its accounts knows it.
const LinkFields = SignerSetSchema.pick({
	label: true,
	status: true,
	draftedBy: true,
	createdAt: true,
	validOn: true,
}).shape;

export const SignerSetLinkSchema = z
	.object({
		accountAddress: SuiAddressSchema,
		accountName: AccountRowSchema.shape.name,
	})
	.extend(LinkFields)
	.openapi('SignerSetLink');

// The composition fields of a signer set, in the order the spec lists
// them.
const { address, threshold, isVerified, totalWeight } =
	SignerSetSchema.shape;

export const SignerSetCompositionSchema = z
	.object({
		address,
		threshold,
		isVerified,
		totalWeight,
		members: z.array(SignerSetMemberRowSchema).openapi({
			description:
				'The members, in order. Key labels belong to an account, so they are only on `Account.signerSets`.',
		}),
		links: z.array(SignerSetLinkSchema).openapi({
			description:
				'The accounts the signer set is linked to, as each knows it: those the session can read, and for a member of the set, the ones it is drafted for. Oldest first.',
		}),
	})
	.openapi('SignerSetComposition');

export const AccountAliasesSchema = z
	.object({
		network: NetworkSchema,
		addresses: z.array(SuiAddressSchema).openapi({
			description:
				'The addresses allowed to sign for the account on the network, sorted. Some may be signer sets the account does not link, or single keys.',
		}),
		observedAt: TimestampSchema.nullable().openapi({
			description:
				'When the alias set was last read from chain, or null while it is the default, the account alone.',
		}),
	})
	.openapi('AccountAliases');

export const AccountSchema = AccountRowSchema.extend({
	proposers: z.array(AccountProposerSchema),
	signerSets: z.array(SignerSetWithMembersSchema).openapi({
		description:
			'Every signer set linked to the account, oldest first, including drafts and retired sets: see `validOn`.',
	}),
	aliases: z.array(AccountAliasesSchema).openapi({
		description:
			'The alias set of the account on each supported network, as last read from chain.',
	}),
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
		signature: SignatureSchema.openapi({
			description:
				'A signature over the personal message the route verifies.',
		}),
	})
	.openapi('SignedMessageRequest');

export const RemoveProposerRequestSchema = z
	.object({
		signature: SignatureSchema.openapi({
			description:
				'An accepted member\'s signature over "Removing proposer <proposer> from account <address>. Valid until: <expiry>".',
		}),
		expiry: z.string().openapi({
			description:
				'The expiry in the signed message, an ISO timestamp at most one hour ahead.',
		}),
	})
	.openapi('RemoveProposerRequest');

// The remove request's fields, with the proposer first and the signature
// over the add message. Built from the shape, not `.extend()`, which
// would make it an `allOf` of the remove request in the spec.
export const AddProposerRequestSchema = z
	.object({
		proposer: SuiAddressSchema,
		...RemoveProposerRequestSchema.shape,
		signature: SignatureSchema.openapi({
			description:
				'An accepted member\'s signature over "Adding proposer <proposer> to account <address>. Valid until: <expiry>".',
		}),
	})
	.openapi('AddProposerRequest');
