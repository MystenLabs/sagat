// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	createRoute,
	z,
	type OpenAPIHono,
} from '@hono/zod-openapi';
import { PersonalMessages } from '@mysten/sagat';

import {
	getAccount,
	listAccounts,
} from '../../services/accounts.service';
import {
	addProposer,
	removeProposer,
} from '../../services/multisig.service';
import {
	authenticated,
	errorResponse,
	jsonBody,
	jsonResponse,
	requireAuth,
	SuccessSchema,
	SuiAddressSchema,
	unauthorizedResponse,
} from '../schemas/common';
import {
	AccountSchema,
	AddProposerRequestSchema,
	RemoveProposerRequestSchema,
} from '../schemas/signer-sets';
import { toAccount } from '../serializers';

const tags = ['Accounts'];

const list = createRoute({
	method: 'get',
	path: '/accounts',
	tags,
	summary: 'List accounts',
	description:
		"The accounts the session can sign for: those with a signer set, valid on some network, in which one of the session's keys has accepted. Each account is listed once. Drafts are not listed: their members see them as invitations.",
	middleware: [requireAuth] as const,
	security: authenticated,
	responses: {
		200: jsonResponse(
			z.array(AccountSchema),
			'The accounts, oldest first.',
		),
		401: unauthorizedResponse,
	},
});

const get = createRoute({
	method: 'get',
	path: '/accounts/{address}',
	tags,
	summary: 'Get an account',
	description:
		'An account with its proposers, signer sets and alias sets, for a session holding a key (accepted or not) in one of its signer sets that is valid on some network.',
	middleware: [requireAuth] as const,
	security: authenticated,
	request: {
		params: z.object({ address: SuiAddressSchema }),
	},
	responses: {
		200: jsonResponse(AccountSchema, 'The account.'),
		400: errorResponse('The address is malformed.'),
		401: unauthorizedResponse,
		403: errorResponse(
			'No key of the session is in a valid signer set of the account.',
		),
		404: errorResponse('The account does not exist.'),
	},
});

const proposerErrors = {
	400: errorResponse(
		'The body is malformed, the expiry is invalid or past, or the signature is invalid.',
	),
	403: errorResponse(
		'The signer is not an accepted member of a signer set of the account valid on any network.',
	),
};

const addAccountProposer = createRoute({
	method: 'post',
	path: '/accounts/{address}/proposers',
	tags,
	summary: 'Add a proposer',
	description:
		'Lets an address propose transactions for the account on every network, without voting. Signed by an accepted member of a signer set valid on any network; no session needed.',
	request: {
		params: z.object({ address: SuiAddressSchema }),
		body: jsonBody(AddProposerRequestSchema),
	},
	responses: {
		200: jsonResponse(
			SuccessSchema,
			'The proposer is added.',
		),
		...proposerErrors,
		400: errorResponse(
			'The body is malformed, the expiry is invalid or past, the signature is invalid, the proposer is already there, or the account has too many proposers.',
		),
	},
});

const removeAccountProposer = createRoute({
	method: 'delete',
	path: '/accounts/{address}/proposers/{proposer}',
	tags,
	summary: 'Remove a proposer',
	description:
		"Removes a proposer, signed by an accepted member of a signer set valid on any network; no session needed. The proposer's pending proposals are cancelled.",
	request: {
		params: z.object({
			address: SuiAddressSchema,
			proposer: SuiAddressSchema,
		}),
		body: jsonBody(RemoveProposerRequestSchema),
	},
	responses: {
		200: jsonResponse(
			SuccessSchema,
			'The proposer is removed.',
		),
		...proposerErrors,
	},
});

export const mountAccounts = (v1: OpenAPIHono) =>
	v1
		.openapi(list, async (c) => {
			const accounts = await listAccounts({
				callerKeys: c.get('publicKeys'),
			});
			return c.json(accounts.map(toAccount), 200);
		})
		.openapi(get, async (c) => {
			const { address } = c.req.valid('param');
			return c.json(
				toAccount(
					await getAccount({
						address,
						callerKeys: c.get('publicKeys'),
					}),
				),
				200,
			);
		})
		.openapi(addAccountProposer, async (c) => {
			const { address } = c.req.valid('param');
			const { proposer, signature, expiry } =
				c.req.valid('json');
			await addProposer({
				address,
				proposer,
				signature,
				expiry,
				message: PersonalMessages.addAccountProposer,
				signerSets: 'valid',
			});
			return c.json({ success: true as const }, 200);
		})
		.openapi(removeAccountProposer, async (c) => {
			const { address, proposer } = c.req.valid('param');
			const { signature, expiry } = c.req.valid('json');
			await removeProposer({
				address,
				proposer,
				signature,
				expiry,
				message: PersonalMessages.removeAccountProposer,
				signerSets: 'valid',
			});
			return c.json({ success: true as const }, 200);
		});
