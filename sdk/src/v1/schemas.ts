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

export const NetworkSchema = z
	.enum(['mainnet', 'testnet', 'devnet', 'localnet'])
	.meta({ id: 'Network', description: 'A Sui network.' });
export type Network = z.infer<typeof NetworkSchema>;

export const KeyAnswerSchema = z
	.enum(['accepted', 'rejected', 'invited'])
	.meta({
		id: 'KeyAnswer',
		description:
			"A key's answer for the account; `invited` until it answers.",
	});
export type KeyAnswer = z.infer<typeof KeyAnswerSchema>;

export const AccountMemberSchema = z
	.object({
		publicKey: z.string(),
		weight: z.number().int(),
		order: z.number().int(),
		answer: KeyAnswerSchema,
		label: z.string().nullable().meta({
			description: "The account's label for the key.",
		}),
	})
	.meta({ id: 'AccountMember' });
export type AccountMember = z.infer<
	typeof AccountMemberSchema
>;

export const AccountSignerSetSchema = z
	.discriminatedUnion('kind', [
		z.object({
			kind: z.literal('signer_set').meta({
				description: 'A composition the API holds.',
			}),
			address: SuiAddressSchema,
			threshold: z.number().int(),
			members: z.array(AccountMemberSchema),
			acting: z.boolean().meta({
				description:
					"True when the set is in the alias set on the request's network; false only for the original set once it was removed there.",
			}),
			original: z.boolean().meta({
				description:
					"True for the original set. A convenience: the original set is the one whose members and threshold make up the account's address, so check the address.",
			}),
		}),
		z.object({
			kind: z.literal('unknown').meta({
				description:
					'An address in the alias set that the API cannot identify. It can sign for the account.',
			}),
			address: SuiAddressSchema,
		}),
	])
	.meta({ id: 'AccountSignerSet' });
export type AccountSignerSet = z.infer<
	typeof AccountSignerSetSchema
>;

const accountFields = {
	address: SuiAddressSchema,
	name: z.string().nullable(),
	createdBy: SuiAddressSchema,
	createdAt: z.iso.datetime(),
	signerSets: z.array(AccountSignerSetSchema).meta({
		description:
			"One entry per signer set: first the original set, the one at the account's address, then the others in the alias set on the request's network.",
	}),
	signersChecked: z.boolean().meta({
		description:
			'False when the alias set could not be read from the chain, so the signers are as last read.',
	}),
};

export const AccountSchema = z
	.object(accountFields)
	.meta({ id: 'Account' });
export type Account = z.infer<typeof AccountSchema>;

export const AccountProposerSchema = z
	.object({
		address: SuiAddressSchema,
		addedBy: SuiAddressSchema,
		addedAt: z.iso.datetime(),
		event: AccountEventSchema.or(z.null()).meta({
			description:
				"The proposer's newest add or remove, or null.",
		}),
	})
	.meta({ id: 'AccountProposer' });
export type AccountProposer = z.infer<
	typeof AccountProposerSchema
>;

export const AccountDetailsSchema = z
	.object({
		...accountFields,
		network: NetworkSchema,
		signerChangesAllowed: z.boolean().meta({
			description:
				'Whether the account has allowed signer changes on the network.',
		}),
		networksWithDifferentSigners: z
			.array(NetworkSchema)
			.meta({
				description:
					'The other supported networks whose alias set differs from this one.',
			}),
		proposers: z.array(AccountProposerSchema),
	})
	.meta({ id: 'AccountDetails' });
export type AccountDetails = z.infer<
	typeof AccountDetailsSchema
>;

export const RemovedAccountSchema = z
	.object({
		address: SuiAddressSchema,
		name: z.string().nullable(),
		publicKey: z.string(),
		signerSetAddress: SuiAddressSchema,
		eventId: z.number().int().meta({
			description: 'The `alias.removed` event.',
		}),
		removedAt: z.iso.datetime(),
	})
	.meta({
		id: 'RemovedAccount',
		description:
			"An account one of the caller's keys was removed from on the network.",
	});
export type RemovedAccount = z.infer<
	typeof RemovedAccountSchema
>;

export const AccountListSchema = z
	.object({
		network: NetworkSchema,
		accounts: z.array(AccountSchema),
		removed: z.array(RemovedAccountSchema),
	})
	.meta({ id: 'AccountList' });
export type AccountList = z.infer<typeof AccountListSchema>;

export const InvitationListSchema = z
	.object({
		network: NetworkSchema,
		invitations: z.array(AccountSchema),
	})
	.meta({ id: 'InvitationList' });
export type InvitationList = z.infer<
	typeof InvitationListSchema
>;

export const InvitationAnswerRequestSchema = z
	.object({
		signature: z.string(),
		expiry: z.string(),
	})
	.meta({ id: 'InvitationAnswerRequest' });
export type InvitationAnswerRequest = z.infer<
	typeof InvitationAnswerRequestSchema
>;

export const InvitationAnswerSchema = z
	.object({
		accountAddress: SuiAddressSchema,
		publicKey: z.string(),
		answer: z.enum(['accepted', 'rejected']),
	})
	.meta({ id: 'InvitationAnswer' });
export type InvitationAnswer = z.infer<
	typeof InvitationAnswerSchema
>;

export const AccountProposerRequestSchema = z
	.object({
		proposer: SuiAddressSchema,
		signature: z.string(),
		expiry: z.string(),
	})
	.meta({ id: 'AccountProposerRequest' });
export type AccountProposerRequest = z.infer<
	typeof AccountProposerRequestSchema
>;

export const SuccessSchema = z
	.object({ success: z.literal(true) })
	.meta({ id: 'Success' });
export type Success = z.infer<typeof SuccessSchema>;
