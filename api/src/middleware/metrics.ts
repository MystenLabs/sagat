// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type Context, type Next } from 'hono';
import { routePath } from 'hono/route';

import {
	httpRequestDuration,
	httpRequestTotal,
} from '../metrics';

export const metricsMiddleware = async (
	c: Context,
	next: Next,
) => {
	const start = Date.now();
	const method = c.req.method;
	const path = routePath(c, -1);

	await next();

	const duration = (Date.now() - start) / 1000;
	const status = c.res.status;

	httpRequestDuration.observe(
		{ method, route: path, status_code: status.toString() },
		duration,
	);

	httpRequestTotal.inc({
		method,
		route: path,
		status_code: status.toString(),
	});
};
