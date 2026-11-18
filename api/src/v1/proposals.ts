// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { createRoute } from '@hono/zod-openapi';
import { v1 } from '@mysten/sagat';
import { z } from 'zod';

import { getProposalTallyByDigest } from '../services/proposals.service';
import { defineRoute, type V1App } from './openapi';
import { toV1Proposal } from './serializers';

const error = (description: string) => ({
	description,
	content: {
		'application/json': { schema: v1.ErrorBodySchema },
	},
});

const getProposal = createRoute({
	method: 'get',
	path: '/proposals/{digest}',
	summary: 'Get a proposal by its transaction digest',
	request: {
		params: z.object({
			digest: v1.TransactionDigestSchema,
		}),
	},
	responses: {
		200: {
			description:
				'The proposal, with its signatures and tally.',
			content: {
				'application/json': { schema: v1.ProposalSchema },
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
			await getProposalTallyByDigest(
				c.req.valid('param').digest,
			),
		),
	);
};
