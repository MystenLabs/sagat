// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	OpenAPIHono,
	type RouteConfig,
	type RouteHandler,
} from '@hono/zod-openapi';
import { ErrorBodySchema } from '@mysten/sagat/v1';
import { routePath } from 'hono/route';
import { type z } from 'zod';

import { ResponseSchemaError } from '../errors';

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

type JsonRoute = RouteConfig & {
	responses: {
		200: {
			content: {
				'application/json': { schema: z.ZodType };
			};
		};
	};
};

type RouteContext<R extends RouteConfig> = Parameters<
	RouteHandler<R>
>[0];

type SuccessSchema<R extends JsonRoute> =
	R['responses'][200]['content']['application/json']['schema'];

// Parses the handler's data with the route's 200 schema before sending it.
export const defineRoute = <R extends JsonRoute>(
	app: V1App,
	route: R,
	handler: (
		c: RouteContext<R>,
	) => Promise<z.input<SuccessSchema<R>>>,
) => {
	const schema: SuccessSchema<R> =
		route.responses[200].content['application/json'].schema;
	app.openapi(route, (async (c: RouteContext<R>) => {
		const parsed = schema.safeParse(await handler(c));
		if (!parsed.success)
			throw new ResponseSchemaError(
				`${c.req.method} ${routePath(c)}`,
				parsed.error.issues,
			);
		return c.json(parsed.data, 200);
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
