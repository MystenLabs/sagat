// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	OpenAPIHono,
	type RouteConfig,
	type RouteHandler,
} from '@hono/zod-openapi';
import {
	ErrorBodySchema,
	NetworkSchema,
	ValidationMessages,
} from '@mysten/sagat/v1';
import { type MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';
import { z } from 'zod';

import { SUPPORTED_NETWORKS } from '../db/env';
import {
	ResponseSchemaError,
	ValidationError,
} from '../errors';
import {
	authMiddleware,
	type AuthEnv,
} from '../services/auth.service';
import { isCanonicalSuiAddress } from '../services/multisig.service';
import { type SuiNetwork } from '../utils/client';

// `<path>: <message>` per issue, or just the message for an empty path.
export const formatIssues = (issues: z.core.$ZodIssue[]) =>
	issues
		.map(({ path, message }) =>
			path.length
				? `${path.join('.')}: ${message}`
				: message,
		)
		.join('; ');

export const createV1App = () =>
	new OpenAPIHono({
		defaultHook: (result, c) =>
			result.success
				? undefined
				: c.json(
						{ error: formatIssues(result.error.issues) },
						400,
					),
	}).basePath('/v1');

export type V1App = ReturnType<typeof createV1App>;

type JsonResponse = {
	content: {
		'application/json': { schema: z.ZodType };
	};
};

type JsonRoute = RouteConfig &
	(
		| { responses: { 200: JsonResponse } }
		| { responses: { 201: JsonResponse } }
	);

type RouteContext<R extends RouteConfig> = Parameters<
	RouteHandler<R>
>[0];

type SuccessStatus<R extends JsonRoute> =
	R['responses'] extends { 201: JsonResponse } ? 201 : 200;

type SuccessResponse<R extends JsonRoute> =
	R['responses'] extends {
		201: infer S extends JsonResponse;
	}
		? S
		: R['responses'] extends {
					200: infer S extends JsonResponse;
			  }
			? S
			: never;

type SuccessSchema<R extends JsonRoute> =
	SuccessResponse<R>['content']['application/json']['schema'];

// Parses the handler's data with the route's success schema before sending it.
export const defineRoute = <R extends JsonRoute>(
	app: V1App,
	route: R,
	handler: (
		c: RouteContext<R>,
	) => Promise<z.input<SuccessSchema<R>>>,
) => {
	const status = (
		201 in route.responses ? 201 : 200
	) as SuccessStatus<R>;
	const schema = (
		route.responses as unknown as Record<
			number,
			SuccessResponse<R>
		>
	)[status].content['application/json']
		.schema as SuccessSchema<R>;
	app.openapi(route, (async (c: RouteContext<R>) => {
		const parsed = schema.safeParse(await handler(c));
		if (!parsed.success)
			throw new ResponseSchemaError(
				`${c.req.method} ${routePath(c)}`,
				parsed.error.issues,
			);
		return c.json(parsed.data, status);
	}) as unknown as RouteHandler<R>);
};

export const json = <T extends z.ZodType>(
	description: string,
	schema: T,
) => ({
	description,
	content: { 'application/json': { schema } },
});

export const error = (description: string) =>
	json(description, ErrorBodySchema);

export const jsonBody = <T extends z.ZodType>(
	schema: T,
) => ({
	required: true,
	content: { 'application/json': { schema } },
});

// The shared middleware refuses in plain text; `/v1` answers with the error body.
const auth: MiddlewareHandler<AuthEnv> = async (c, next) =>
	(await authMiddleware(c, next))
		? c.json({ error: 'Unauthorized' }, 401)
		: undefined;

const security: Record<string, string[]>[] = [
	{ cookieAuth: [] },
	{ bearerAuth: [] },
];
export const authenticated = {
	middleware: auth,
	security,
};

// A route open to all that still reads the session of a request that has one.
const readSession: MiddlewareHandler<AuthEnv> = async (
	c,
	next,
) => {
	if (await authMiddleware(c, async () => {}))
		c.set('publicKeys', []);
	await next();
};
export const sessionIfAny = { middleware: readSession };

export const unauthorized = error('No valid session.');

export const unavailable = error(
	'The signers of the account on the network could not be checked, or the account is busy.',
);

// Canonical, as the signed messages name it.
export const CanonicalAddressSchema = z
	.string()
	.refine(isCanonicalSuiAddress, {
		message: ValidationMessages.InvalidAddress,
	})
	.meta({
		description:
			'A Sui address in canonical form: `0x` and 64 lower-case hex digits.',
	});

// The shared check, in the `/v1` wording.
const validateNetwork = (network: string) => {
	if (!SUPPORTED_NETWORKS.includes(network as SuiNetwork))
		throw new ValidationError(
			`Unsupported network: ${network}. Supported: ${SUPPORTED_NETWORKS.join(', ')}.`,
		);
	return network as SuiNetwork;
};

// A `network` query that is one of this deployment's networks.
export const networkQuery = z.object({
	network: NetworkSchema.transform(validateNetwork),
});
