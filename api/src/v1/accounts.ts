// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { createRoute } from '@hono/zod-openapi';
import {
	AccountDetailsSchema,
	AccountListSchema,
	AccountProposerRemovalSchema,
	AccountProposerRequestSchema,
	InvitationAnswerRequestSchema,
	InvitationAnswerSchema,
	InvitationListSchema,
	SuccessSchema,
} from '@mysten/sagat/v1';
import { z } from 'zod';

import { SUPPORTED_NETWORKS } from '../db/env';
import {
	addAccountProposer,
	answerAccountInvitation,
	getAccount,
	listAccountInvitations,
	listAccounts,
	removeAccountProposer,
} from '../services/accounts.service';
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
import {
	toV1Account,
	toV1AccountProposer,
	toV1RemovedAccount,
} from './serializers';

const addressParams = z.object({
	address: CanonicalAddressSchema,
});

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
			body: jsonBody(InvitationAnswerRequestSchema),
		},
		responses: {
			200: json(
				'The answer, as recorded.',
				InvitationAnswerSchema,
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

const proposerRoute = <S extends z.ZodType>(
	method: 'post' | 'delete',
	done: ReturnType<typeof json<S>>,
) =>
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
				: 'Signed with `PersonalMessages.removeMultisigProposer` by an accepted key of an acting signer set. Cancels the proposer’s pending proposals on the network, except a signer change.',
		request: {
			params: addressParams,
			query: networkQuery,
			body: jsonBody(AccountProposerRequestSchema),
		},
		responses: {
			200: done,
			400: error(
				'The request, address, proposer, expiry or signature is invalid.',
			),
			403: error(
				'The signer is no accepted key of an acting signer set of the account on the network.',
			),
			503: unavailable,
		},
	});

export const accountRoutes = (app: V1App) => {
	defineRoute(app, listAccountsRoute, async (c) => {
		const { network } = c.req.valid('query');
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
		const { network } = c.req.valid('query');
		const account = await getAccount({
			address: c.req.valid('param').address,
			network,
			networks: SUPPORTED_NETWORKS,
			callerKeys: c.get('publicKeys'),
		});
		return {
			...toV1Account(account),
			network,
			signerChangesEnabled: account.signerChangesEnabled,
			networksWithDifferentSigners:
				account.networksWithDifferentSigners,
			proposers: account.proposers.map(toV1AccountProposer),
			openSignerChange: account.openSignerChange,
		};
	});

	defineRoute(app, listInvitationsRoute, async (c) => {
		const { network, showRejected } = c.req.valid('query');
		const invitations = await listAccountInvitations({
			callerKeys: c.get('publicKeys'),
			network,
			showRejected: showRejected === 'true',
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
				network: c.req.valid('query').network,
				answer: given,
				...c.req.valid('json'),
			}),
		);

	defineRoute(
		app,
		proposerRoute(
			'post',
			json('The change was made.', SuccessSchema),
		),
		async (c) => {
			await addAccountProposer({
				address: c.req.valid('param').address,
				network: c.req.valid('query').network,
				...c.req.valid('json'),
			});
			return { success: true as const };
		},
	);

	defineRoute(
		app,
		proposerRoute(
			'delete',
			json(
				'Whether the proposer was removed, and the proposals cancelled.',
				AccountProposerRemovalSchema,
			),
		),
		async (c) =>
			removeAccountProposer({
				address: c.req.valid('param').address,
				network: c.req.valid('query').network,
				...c.req.valid('json'),
			}),
	);
};
