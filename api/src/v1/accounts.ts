// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { createRoute } from '@hono/zod-openapi';
import {
	AccountAnswerRequestSchema,
	AccountAnswerSchema,
	AccountDetailsSchema,
	AccountListSchema,
	AccountProposerRequestSchema,
	ErrorBodySchema,
	InvitationListSchema,
	NetworkSchema,
	SuccessSchema,
	SuiAddressSchema,
} from '@mysten/sagat/v1';
import { type MiddlewareHandler } from 'hono';
import { z } from 'zod';

import {
	SUPPORTED_NETWORKS,
	validateNetwork,
} from '../db/env';
import {
	addAccountProposer,
	answerAccountInvitation,
	getAccount,
	listAccountInvitations,
	listAccounts,
	removeAccountProposer,
} from '../services/accounts.service';
import {
	authMiddleware,
	type AuthEnv,
} from '../services/auth.service';
import { defineRoute, type V1App } from './openapi';
import {
	toV1Account,
	toV1AccountProposer,
	toV1RemovedAccount,
} from './serializers';

const error = (description: string) => ({
	description,
	content: {
		'application/json': { schema: ErrorBodySchema },
	},
});

const json = <T extends z.ZodType>(
	description: string,
	schema: T,
) => ({
	description,
	content: { 'application/json': { schema } },
});

const auth: MiddlewareHandler<AuthEnv> = authMiddleware;

const security: Record<string, string[]>[] = [
	{ cookieAuth: [] },
	{ bearerAuth: [] },
];
const authenticated = {
	middleware: auth,
	security,
};

const unauthorized = {
	description: 'No valid session.',
	content: { 'text/plain': { schema: z.string() } },
};

const networkQuery = z.object({ network: NetworkSchema });
const addressParams = z.object({
	address: SuiAddressSchema,
});

const unavailable = error(
	'The signers of the account on the network could not be checked, or the account is busy.',
);

const listAccountsRoute = createRoute({
	method: 'get',
	path: '/accounts',
	summary: "List the caller's accounts on a network",
	...authenticated,
	request: { query: networkQuery },
	responses: {
		200: json(
			'The accounts a caller’s key has accepted and signs for on the network, and the ones a key was removed from.',
			AccountListSchema,
		),
		400: error('The network is not supported.'),
		401: unauthorized,
	},
});

const getAccountRoute = createRoute({
	method: 'get',
	path: '/accounts/{address}',
	summary: 'Get an account on a network',
	...authenticated,
	request: { params: addressParams, query: networkQuery },
	responses: {
		200: json(
			'The account, with its signer sets on the network and its proposers.',
			AccountDetailsSchema,
		),
		400: error(
			'The address is invalid or the network is not supported.',
		),
		401: unauthorized,
		403: error(
			'No caller key is in an acting signer set of the account on the network.',
		),
	},
});

const listInvitationsRoute = createRoute({
	method: 'get',
	path: '/invitations',
	summary: "List the caller's invitations on a network",
	...authenticated,
	request: {
		query: networkQuery.extend({
			showRejected: z
				.enum(['true', 'false'])
				.optional()
				.meta({
					description:
						'`true` lists the accounts a key rejected instead.',
				}),
		}),
	},
	responses: {
		200: json(
			'The accounts where a caller’s key is in an acting signer set on the network and has not answered.',
			InvitationListSchema,
		),
		400: error('The network is not supported.'),
		401: unauthorized,
	},
});

const answerRoute = (answer: 'accept' | 'reject') =>
	createRoute({
		method: 'post',
		path: `/accounts/{address}/${answer}`,
		summary:
			answer === 'accept'
				? 'Accept an account'
				: 'Reject an account',
		description: `Signed with \`PersonalMessages.${answer}AccountInvitation\` by a key of an acting signer set.`,
		request: {
			params: addressParams,
			query: networkQuery,
			body: {
				required: true,
				content: {
					'application/json': {
						schema: AccountAnswerRequestSchema,
					},
				},
			},
		},
		responses: {
			200: json(
				'The answer, as recorded.',
				AccountAnswerSchema,
			),
			400: error(
				'The request, address, expiry or signature is invalid, or the answer cannot be given.',
			),
			403: error(
				'The signer is in no acting signer set of the account on the network.',
			),
			503: unavailable,
		},
	});

const proposerRoute = (method: 'post' | 'delete') =>
	createRoute({
		method,
		path: '/accounts/{address}/proposers',
		summary:
			method === 'post'
				? 'Add an external proposer'
				: 'Remove an external proposer',
		description:
			method === 'post'
				? 'Signed with `PersonalMessages.addMultisigProposer` by an accepted key of an acting signer set.'
				: 'Signed with `PersonalMessages.removeMultisigProposer` by an accepted key of an acting signer set. Cancels the proposer’s pending proposals on the network.',
		request: {
			params: addressParams,
			query: networkQuery,
			body: {
				required: true,
				content: {
					'application/json': {
						schema: AccountProposerRequestSchema,
					},
				},
			},
		},
		responses: {
			200: json('The change was made.', SuccessSchema),
			400: error(
				'The request, proposer, expiry or signature is invalid.',
			),
			403: error(
				'The signer is no accepted key of an acting signer set of the account on the network.',
			),
			503: unavailable,
		},
	});

export const accountRoutes = (app: V1App) => {
	defineRoute(app, listAccountsRoute, async (c) => {
		const network = validateNetwork(
			c.req.valid('query').network,
		);
		const { accounts, removed } = await listAccounts({
			callerKeys: c.get('publicKeys'),
			network,
		});
		return {
			network,
			accounts: accounts.map(toV1Account),
			removed: removed.map(toV1RemovedAccount),
		};
	});

	defineRoute(app, getAccountRoute, async (c) => {
		const network = validateNetwork(
			c.req.valid('query').network,
		);
		const account = await getAccount({
			address: c.req.valid('param').address,
			network,
			networks: SUPPORTED_NETWORKS,
			callerKeys: c.get('publicKeys'),
		});
		return {
			...toV1Account(account),
			network,
			signerChangesAllowed: account.signerChangesAllowed,
			networksWithDifferentSigners:
				account.networksWithDifferentSigners,
			proposers: account.proposers.map(toV1AccountProposer),
		};
	});

	defineRoute(app, listInvitationsRoute, async (c) => {
		const query = c.req.valid('query');
		const network = validateNetwork(query.network);
		const invitations = await listAccountInvitations({
			callerKeys: c.get('publicKeys'),
			network,
			showRejected: query.showRejected === 'true',
		});
		return {
			network,
			invitations: invitations.map(toV1Account),
		};
	});

	for (const [answer, given] of [
		['accept', 'accepted'],
		['reject', 'rejected'],
	] as const)
		defineRoute(app, answerRoute(answer), async (c) =>
			answerAccountInvitation({
				address: c.req.valid('param').address,
				network: validateNetwork(
					c.req.valid('query').network,
				),
				answer: given,
				...c.req.valid('json'),
			}),
		);

	for (const [method, change] of [
		['post', addAccountProposer],
		['delete', removeAccountProposer],
	] as const)
		defineRoute(app, proposerRoute(method), async (c) => {
			await change({
				address: c.req.valid('param').address,
				network: validateNetwork(
					c.req.valid('query').network,
				),
				...c.req.valid('json'),
			});
			return { success: true as const };
		});
};
