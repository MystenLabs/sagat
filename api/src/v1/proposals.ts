// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { createRoute } from '@hono/zod-openapi';
import {
	ErrorBodySchema,
	ProposalSchema,
	TransactionDigestSchema,
} from '@mysten/sagat/v1';
import { z } from 'zod';

import { getProposalByDigest } from '../services/proposals.service';
import { defineRoute, type V1App } from './openapi';
import { toV1Proposal } from './serializers';

const error = (description: string) => ({
	description,
	content: {
		'application/json': { schema: ErrorBodySchema },
	},
});

const getProposal = createRoute({
	method: 'get',
	path: '/proposals/{digest}',
	summary: 'Get a proposal by its transaction digest',
	request: {
		params: z.object({
			digest: TransactionDigestSchema,
		}),
	},
	responses: {
		200: {
			description:
				'The proposal, with its signatures, signer sets and audit log events.',
			content: {
				'application/json': { schema: ProposalSchema },
			},
		},
		400: error(
			'The digest is not a valid transaction digest.',
		),
		404: error('No proposal has this digest.'),
	},
});

export const proposalRoutes = (app: V1App) => {
	defineRoute(app, getProposal, async (c) =>
		toV1Proposal(
			await getProposalByDigest(
				c.req.valid('param').digest,
				'acting',
			),
		),
	);
};
