// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	createRoute,
	z,
	type OpenAPIHono,
} from '@hono/zod-openapi';

import {
	getSignerSetForMember,
	listSignerSetInvitations,
	loadAccount,
	loadSignerSet,
} from '../../services/accounts.service';
import {
	acceptInvitation,
	createSignerSet,
	rejectInvitation,
} from '../../services/multisig.service';
import {
	authenticated,
	errorResponse,
	jsonBody,
	jsonResponse,
	PublicKeySchema,
	requireAuth,
	SuiAddressSchema,
	unauthorizedResponse,
} from '../schemas/common';
import {
	AccountSchema,
	CreateSignerSetRequestSchema,
	SignedMessageRequestSchema,
	SignerSetSchema,
	SignerSetWithMembersSchema,
} from '../schemas/signer-sets';
import {
	toAccount,
	toSignerSet,
	toSignerSetWithMembers,
} from '../serializers';

const tags = ['Signer sets'];

const AddressParams = z.object({
	address: SuiAddressSchema,
});

const create = createRoute({
	method: 'post',
	path: '/signer-sets',
	tags,
	summary: 'Create a signer set',
	description:
		"Creates a signer set and the account with the same address, which it is the original signer set of. The session's keys in the set accept right away; the others are invited.",
	middleware: [requireAuth] as const,
	security: authenticated,
	request: { body: jsonBody(CreateSignerSetRequestSchema) },
	responses: {
		200: jsonResponse(
			AccountSchema,
			'The new account, with the signer set.',
		),
		400: errorResponse(
			'The composition or the labels are invalid, or the signer set already exists.',
		),
		401: unauthorizedResponse,
	},
});

const get = createRoute({
	method: 'get',
	path: '/signer-sets/{address}',
	tags,
	summary: 'Get a signer set',
	description:
		"A signer set with its members, for a session holding one of its keys (accepted or not). Labels and status are those of the signer set's own account.",
	middleware: [requireAuth] as const,
	security: authenticated,
	request: { params: AddressParams },
	responses: {
		200: jsonResponse(
			SignerSetWithMembersSchema,
			'The signer set.',
		),
		400: errorResponse('The address is malformed.'),
		401: unauthorizedResponse,
		403: errorResponse(
			'No key of the session is in the signer set.',
		),
		404: errorResponse('The signer set does not exist.'),
	},
});

const accept = createRoute({
	method: 'post',
	path: '/signer-sets/{address}/accept',
	tags,
	summary: 'Accept an invitation',
	description:
		'Accepts the invitation of the key that signed "Participating in multisig <address>". No session needed: the signature identifies the member. Once every member has accepted, the signer set is verified.',
	request: {
		params: AddressParams,
		body: jsonBody(SignedMessageRequestSchema),
	},
	responses: {
		200: jsonResponse(
			SignerSetSchema,
			'The signer set after the change, without its members: the route needs no session, so it never returns key labels.',
		),
		400: errorResponse(
			'The signer is not a member, the signature is invalid, or the key is in too many signer sets.',
		),
	},
});

const reject = createRoute({
	method: 'post',
	path: '/signer-sets/{address}/reject',
	tags,
	summary: 'Reject an invitation',
	description:
		'Rejects the invitation of the key that signed "Rejecting multisig invitation <address>". No session needed: the signature identifies the member. An accepted invitation, or a verified signer set, cannot be rejected.',
	request: {
		params: AddressParams,
		body: jsonBody(SignedMessageRequestSchema),
	},
	responses: {
		200: jsonResponse(
			SignerSetSchema,
			'The signer set after the change, without its members: the route needs no session, so it never returns key labels.',
		),
		400: errorResponse(
			'The signature is invalid, the signer is not a member, or the invitation was already answered.',
		),
		404: errorResponse('The signer set does not exist.'),
	},
});

const invitations = createRoute({
	method: 'get',
	path: '/signer-sets/invitations/{publicKey}',
	tags,
	summary: 'List invitations',
	description:
		'The signer sets a key of the session is invited to and has not answered, or with `showRejected`, the ones it rejected.',
	middleware: [requireAuth] as const,
	security: authenticated,
	request: {
		params: z.object({ publicKey: PublicKeySchema }),
		query: z.object({
			showRejected: z
				.enum(['true', 'false'])
				.optional()
				.openapi({
					description:
						'List the rejected invitations instead.',
				}),
		}),
	},
	responses: {
		200: jsonResponse(
			z.array(SignerSetWithMembersSchema),
			'The signer sets.',
		),
		400: errorResponse(
			'The public key is not one of the session.',
		),
		401: unauthorizedResponse,
	},
});

export const mountSignerSets = (v1: OpenAPIHono) =>
	v1
		.openapi(create, async (c) => {
			const {
				publicKeys,
				weights,
				threshold,
				name,
				labels,
			} = c.req.valid('json');
			const { signerSet } = await createSignerSet({
				publicKeys,
				weights,
				threshold,
				name,
				labels,
				callerKeys: c.get('publicKeys'),
			});
			// The caller need not be a member, so the account is loaded
			// without the access check of the account route.
			return c.json(
				toAccount(await loadAccount(signerSet.address)),
				200,
			);
		})
		.openapi(invitations, async (c) => {
			const { publicKey } = c.req.valid('param');
			const { showRejected } = c.req.valid('query');
			const signerSets = await listSignerSetInvitations({
				publicKey,
				showRejected: showRejected === 'true',
				callerKeys: c.get('publicKeys'),
			});
			return c.json(
				signerSets.map(toSignerSetWithMembers),
				200,
			);
		})
		.openapi(get, async (c) => {
			const { address } = c.req.valid('param');
			return c.json(
				toSignerSetWithMembers(
					await getSignerSetForMember({
						address,
						callerKeys: c.get('publicKeys'),
					}),
				),
				200,
			);
		})
		.openapi(accept, async (c) => {
			const { address } = c.req.valid('param');
			const { signature } = c.req.valid('json');
			await acceptInvitation({ address, signature });
			return c.json(
				toSignerSet(await loadSignerSet(address)),
				200,
			);
		})
		.openapi(reject, async (c) => {
			const { address } = c.req.valid('param');
			const { signature } = c.req.valid('json');
			await rejectInvitation({ address, signature });
			return c.json(
				toSignerSet(await loadSignerSet(address)),
				200,
			);
		});
