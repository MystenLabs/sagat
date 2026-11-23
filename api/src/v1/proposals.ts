// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { createRoute } from '@hono/zod-openapi';
import {
	CreateProposalRequestSchema,
	ProposalListSchema,
	ProposalSchema,
	ProposalStatusNameSchema,
	SignatureRequestSchema,
	TransactionDigestSchema,
} from '@mysten/sagat/v1';
import { z } from 'zod';

import {
	cancelProposal,
	createProposal,
	getProposalByDigest,
	listAccountProposals,
	verifyProposalByDigest,
	voteOnProposal,
} from '../services/proposals.service';
import { newCursor } from '../utils/pagination';
import {
	authenticated,
	CanonicalAddressSchema,
	defineRoute,
	error,
	json,
	jsonBody,
	networkQuery,
	unauthorized,
	unavailable,
	type V1App,
} from './openapi';
import { toV1Proposal } from './serializers';

const digestParams = z.object({
	digest: TransactionDigestSchema,
});

const proposalResponse = (description: string) =>
	json(description, ProposalSchema);

const signatureBody = jsonBody(SignatureRequestSchema);

const createProposalRoute = createRoute({
	method: 'post',
	path: '/proposals',
	summary: 'Propose a transaction',
	description:
		'Signed over the transaction by an accepted key of an acting signer set, or by a proposer of the account. A member’s signature counts as its first vote. Only one proposal that calls `0x2::address_alias` per account and network is pending at a time. A signer change, recognised by its composition note, is checked against the account’s signers on the network, and the signer set it adds is written.',
	request: {
		query: networkQuery,
		body: jsonBody(CreateProposalRequestSchema),
	},
	responses: {
		201: proposalResponse('The proposal, as created.'),
		400: error(
			'The request, transaction or signature is invalid, the network is not supported, or a signer change does not check.',
		),
		403: error(
			'The signer may not propose for the account on the network, the address is not an account, or the proposer of a signer change is not an accepted signer of the set it replaces who stays.',
		),
		503: unavailable,
	},
});

const listProposalsRoute = createRoute({
	method: 'get',
	path: '/proposals',
	summary: "List an account's proposals on a network",
	...authenticated,
	request: {
		query: z.object({
			accountAddress: CanonicalAddressSchema,
			...networkQuery.shape,
			status: ProposalStatusNameSchema.optional(),
			nextCursor: z.string().optional().meta({
				description:
					'The `nextCursor` of the previous page. Anything else starts from the first page.',
			}),
			perPage: z.string().optional().meta({
				description:
					'The page size. Anything but a whole number up to the maximum gives the maximum.',
			}),
		}),
	},
	responses: {
		200: json(
			'A page of the account’s proposals on the network, newest first, each counted against the signer sets that act now.',
			ProposalListSchema,
		),
		400: error(
			'The address, status or network is invalid.',
		),
		401: unauthorized,
		403: error(
			'No caller key is an accepted key of an acting signer set of the account on the network.',
		),
	},
});

const getProposalRoute = createRoute({
	method: 'get',
	path: '/proposals/{digest}',
	summary: 'Get a proposal by its transaction digest',
	request: { params: digestParams },
	responses: {
		200: proposalResponse(
			'The proposal, with its signatures, signer sets and audit log events. The signatures of a signer change are withheld until it is ready.',
		),
		400: error(
			'The digest is not a valid transaction digest.',
		),
		404: error('No proposal has this digest.'),
	},
});

const voteRoute = createRoute({
	method: 'post',
	path: '/proposals/{digest}/vote',
	summary: 'Sign a proposal',
	description:
		'Signed over the transaction by a key of an acting signer set, accepted or not. A signer change only by a key of the signer set it replaces.',
	request: { params: digestParams, body: signatureBody },
	responses: {
		200: proposalResponse(
			'The proposal, with the new signature.',
		),
		400: error(
			'The digest or signature is invalid, the key has signed already, or the proposal is not pending.',
		),
		403: error(
			'The key is in no acting signer set of the account on the network, or the proposal is a signer change and the key is not in the set it replaces.',
		),
		404: error('No proposal has this digest.'),
		503: unavailable,
	},
});

const cancelRoute = createRoute({
	method: 'post',
	path: '/proposals/{digest}/cancel',
	summary: 'Cancel a proposal',
	description:
		'Signed with `PersonalMessages.cancelProposal` by an accepted key of an acting signer set, or by the proposal’s external proposer while nobody has signed. A signer change only by an accepted signer of the set it replaces who stays.',
	request: { params: digestParams, body: signatureBody },
	responses: {
		200: proposalResponse('The proposal, cancelled.'),
		400: error(
			'The digest or signature is invalid, a signer has already signed the proposer’s proposal, or the proposal is not pending.',
		),
		403: error(
			'The signer is neither an accepted key of an acting signer set of the account on the network nor the proposal’s proposer, or the proposal is a signer change and the signer does not stay.',
		),
		404: error('No proposal has this digest.'),
		503: unavailable,
	},
});

const verifyRoute = createRoute({
	method: 'post',
	path: '/proposals/{digest}/verify',
	summary: 'Record the on-chain outcome of a proposal',
	description:
		'Open to anyone: it only reads the chain. A proposal that is no longer pending is returned as is.',
	request: { params: digestParams },
	responses: {
		200: proposalResponse(
			'The proposal, with its outcome and the address that signed for the account.',
		),
		400: error(
			'The digest is invalid, or the transaction has not been executed yet.',
		),
		404: error('No proposal has this digest.'),
	},
});

// The proposal as `GET /v1/proposals/{digest}` returns it.
const proposalAt = async (digest: string) =>
	toV1Proposal(await getProposalByDigest(digest, 'acting'));

export const proposalRoutes = (app: V1App) => {
	defineRoute(app, createProposalRoute, async (c) => {
		const { network } = c.req.valid('query');
		const { accountAddress, ...body } = c.req.valid('json');
		const proposal = await createProposal({
			...body,
			multisigAddress: accountAddress,
			network,
			scopeKind: 'acting',
		});
		return proposalAt(proposal.digest);
	});

	defineRoute(app, listProposalsRoute, async (c) => {
		const query = c.req.valid('query');
		const page = await listAccountProposals({
			multisigAddress: query.accountAddress,
			network: query.network,
			status: query.status,
			cursor: newCursor(query),
			callerKeys: c.get('publicKeys'),
		});
		return {
			network: query.network,
			accountAddress: query.accountAddress,
			proposals: page.data.map(toV1Proposal),
			hasNextPage: page.hasNextPage,
			nextCursor: page.nextCursor ?? null,
			perPage: page.perPage,
		};
	});

	defineRoute(app, getProposalRoute, async (c) =>
		proposalAt(c.req.valid('param').digest),
	);

	for (const [route, act] of [
		[voteRoute, voteOnProposal],
		[cancelRoute, cancelProposal],
	] as const)
		defineRoute(app, route, async (c) => {
			const { digest } = c.req.valid('param');
			await act({
				digest,
				...c.req.valid('json'),
				scopeKind: 'acting',
			});
			return proposalAt(digest);
		});

	defineRoute(app, verifyRoute, async (c) => {
		const { digest } = c.req.valid('param');
		await verifyProposalByDigest(digest, 'acting');
		return proposalAt(digest);
	});
};
