// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	createRoute,
	z,
	type OpenAPIHono,
} from '@hono/zod-openapi';

import { ProposalStatus } from '../../db/schema';
import {
	cancelProposal,
	createProposal,
	getProposalSignerSetsByDigest,
	listProposalsWithSignerSets,
	verifyAccountProposal,
	verifyAccountProposalByDigest,
	voteAndTallySignerSets,
} from '../../services/proposals.service';
import { newCursor } from '../../utils/pagination';
import {
	authenticated,
	errorResponse,
	jsonBody,
	jsonResponse,
	requireAuth,
	SuiAddressSchema,
	TransactionDigestSchema,
	unauthorizedResponse,
} from '../schemas/common';
import {
	CancelProposalResponseSchema,
	CreateProposalRequestSchema,
	ProposalPageSchema,
	PublicProposalSchema,
	VerifyProposalResponseSchema,
	VoteProposalRequestSchema,
	VoteProposalResponseSchema,
} from '../schemas/proposals';
import { ProposalSchema } from '../schemas/rows';
import { SignedMessageRequestSchema } from '../schemas/signer-sets';
import {
	toProposal,
	toProposalPage,
	toPublicProposal,
	toVoteResponse,
} from '../serializers';

const tags = ['Proposals'];

// The names of the `ProposalStatus` values, in their order: the list
// filter takes a name, while proposals carry the number.
const PROPOSAL_STATUS_NAMES = Object.keys(
	ProposalStatus,
).filter((key) => Number.isNaN(Number(key))) as [
	keyof typeof ProposalStatus,
	...(keyof typeof ProposalStatus)[],
];

const IdParams = z.object({
	id: z.coerce
		.number()
		.int()
		.positive()
		.openapi({ description: 'The proposal id.' }),
});

const DigestParams = z.object({
	digest: TransactionDigestSchema,
});

const create = createRoute({
	method: 'post',
	path: '/proposals',
	tags,
	summary: 'Create a proposal',
	description:
		"Proposes a transaction for an account, signed by an accepted member of a signer set valid on the network, or by a proposer of the account. A member's signature is its first vote. The transaction may not reuse an owned object of another pending proposal.",
	request: { body: jsonBody(CreateProposalRequestSchema) },
	responses: {
		201: jsonResponse(ProposalSchema, 'The new proposal.'),
		400: errorResponse(
			'The network is unsupported, the transaction is unresolved, invalid or conflicts with a pending proposal, or the signature is invalid.',
		),
		403: errorResponse(
			'The signer is neither an accepted member of a signer set valid on the network nor a proposer.',
		),
		404: errorResponse('The account does not exist.'),
	},
});

const list = createRoute({
	method: 'get',
	path: '/proposals',
	tags,
	summary: 'List proposals',
	description:
		"An account's proposals on a network, newest first, for a session holding an accepted key in a signer set valid on that network.",
	middleware: [requireAuth] as const,
	security: authenticated,
	request: {
		query: z.object({
			accountAddress: SuiAddressSchema,
			network: z.string().openapi({ example: 'mainnet' }),
			status: z.enum(PROPOSAL_STATUS_NAMES).optional(),
			nextCursor: z.string().optional().openapi({
				description:
					'The `nextCursor` of the previous page.',
			}),
			perPage: z.coerce
				.number()
				.int()
				.positive()
				.optional()
				.openapi({
					description:
						'The page size. Larger values are capped.',
				}),
		}),
	},
	responses: {
		200: jsonResponse(ProposalPageSchema, 'A page.'),
		400: errorResponse(
			'The query is malformed or the network is unsupported.',
		),
		401: unauthorizedResponse,
		403: errorResponse(
			'No accepted key of the session is in a signer set valid on the network.',
		),
	},
});

const getByDigest = createRoute({
	method: 'get',
	path: '/proposals/digest/{digest}',
	tags,
	summary: 'Get a proposal by digest',
	description:
		"Public. The proposal with its signatures and the account's signer sets valid on the proposal's network, each with its progress. Key labels and proposers are never included.",
	request: { params: DigestParams },
	responses: {
		200: jsonResponse(
			PublicProposalSchema,
			'The proposal.',
		),
		400: errorResponse('The digest is malformed.'),
		404: errorResponse('No proposal has this digest.'),
	},
});

const vote = createRoute({
	method: 'post',
	path: '/proposals/{id}/vote',
	tags,
	summary: 'Vote for a proposal',
	description:
		"Adds the signature over the proposal's transaction of an accepted member of a signer set valid on the proposal's network.",
	request: {
		params: IdParams,
		body: jsonBody(VoteProposalRequestSchema),
	},
	responses: {
		200: jsonResponse(
			VoteProposalResponseSchema,
			'Which signer sets can now execute the proposal.',
		),
		400: errorResponse(
			'The proposal does not exist or is not pending, the member already voted, or the signature is not over the transaction.',
		),
		403: errorResponse(
			"The signer is not an accepted member of a signer set valid on the proposal's network.",
		),
	},
});

const cancel = createRoute({
	method: 'post',
	path: '/proposals/{id}/cancel',
	tags,
	summary: 'Cancel a proposal',
	description:
		'Cancels a pending proposal, signed over "Cancel proposal <id>" by an accepted member of a signer set valid on the proposal\'s network.',
	request: {
		params: IdParams,
		body: jsonBody(SignedMessageRequestSchema),
	},
	responses: {
		200: jsonResponse(
			CancelProposalResponseSchema,
			'The proposal is cancelled.',
		),
		400: errorResponse(
			"The proposal does not exist or is not pending, the signer is not an accepted member of a signer set valid on the proposal's network, or the signature is invalid.",
		),
	},
});

const verifyResponses = {
	200: jsonResponse(
		VerifyProposalResponseSchema,
		'The outcome on chain is recorded in the proposal status, and the signer in `executedVia`.',
	),
};

const verify = createRoute({
	method: 'post',
	path: '/proposals/{id}/verify',
	tags,
	summary: 'Verify an executed proposal',
	description:
		'Reads the transaction from the chain and records whether it succeeded and which signer set executed it (`executedVia`), for a session holding an accepted key in a signer set of the account valid on any network. Call it after executing.',
	middleware: [requireAuth] as const,
	security: authenticated,
	request: { params: IdParams },
	responses: {
		...verifyResponses,
		400: errorResponse(
			'The proposal does not exist, or was not executed yet.',
		),
		401: unauthorizedResponse,
		403: errorResponse(
			'No accepted key of the session is in a valid signer set of the account.',
		),
	},
});

const verifyByDigest = createRoute({
	method: 'post',
	path: '/proposals/{digest}/verify-by-digest',
	tags,
	summary: 'Verify an executed proposal by digest',
	description:
		'Public. Like the verify route, for a proposal found by its digest: it only reads the chain.',
	request: { params: DigestParams },
	responses: {
		...verifyResponses,
		400: errorResponse(
			'The digest is malformed, or the proposal was not executed yet.',
		),
		404: errorResponse('No proposal has this digest.'),
	},
});

export const mountProposals = (v1: OpenAPIHono) =>
	v1
		.openapi(create, async (c) => {
			const {
				accountAddress,
				transactionBytes,
				signature,
				description,
				network,
			} = c.req.valid('json');
			const proposal = await createProposal({
				multisigAddress: accountAddress,
				transactionBytes,
				signature,
				description,
				network,
				signerSets: 'valid',
			});
			return c.json(toProposal(proposal), 201);
		})
		.openapi(list, async (c) => {
			const {
				accountAddress,
				network,
				status,
				nextCursor,
				perPage,
			} = c.req.valid('query');
			const page = await listProposalsWithSignerSets({
				multisigAddress: accountAddress,
				network,
				status,
				cursor: newCursor({ nextCursor, perPage }),
				callerKeys: c.get('publicKeys'),
			});
			return c.json(toProposalPage(page), 200);
		})
		.openapi(getByDigest, async (c) => {
			const { digest } = c.req.valid('param');
			return c.json(
				toPublicProposal(
					await getProposalSignerSetsByDigest(digest),
				),
				200,
			);
		})
		.openapi(vote, async (c) => {
			const { id } = c.req.valid('param');
			const { signature } = c.req.valid('json');
			const signerSets = await voteAndTallySignerSets({
				proposalId: id,
				signature,
			});
			return c.json(toVoteResponse(signerSets), 200);
		})
		.openapi(cancel, async (c) => {
			const { id } = c.req.valid('param');
			const { signature } = c.req.valid('json');
			await cancelProposal({
				proposalId: id,
				signature,
				signerSets: 'valid',
			});
			return c.json(
				{ message: 'Proposal cancelled successfully' },
				200,
			);
		})
		.openapi(verify, async (c) => {
			const { id } = c.req.valid('param');
			await verifyAccountProposal({
				proposalId: id,
				callerKeys: c.get('publicKeys'),
			});
			return c.json({ verified: true as const }, 200);
		})
		.openapi(verifyByDigest, async (c) => {
			const { digest } = c.req.valid('param');
			await verifyAccountProposalByDigest(digest);
			return c.json({ verified: true as const }, 200);
		});
