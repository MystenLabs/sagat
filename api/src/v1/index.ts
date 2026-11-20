// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { JWT_COOKIE_NAME } from '../services/auth.service';
import { accountRoutes } from './accounts';
import { createV1App } from './openapi';
import { proposalRoutes } from './proposals';

const v1App = createV1App();

v1App.openAPIRegistry.registerComponent(
	'securitySchemes',
	'cookieAuth',
	{
		type: 'apiKey',
		in: 'cookie',
		name: `__Host-${JWT_COOKIE_NAME}`,
		description:
			'The session cookie set by `POST /auth/connect`.',
	},
);
v1App.openAPIRegistry.registerComponent(
	'securitySchemes',
	'bearerAuth',
	{
		type: 'http',
		scheme: 'bearer',
		bearerFormat: 'JWT',
		description:
			'A script token from `POST /auth/script-connect`.',
	},
);

proposalRoutes(v1App);
accountRoutes(v1App);

export const getV1OpenAPIDocument = (): ReturnType<
	typeof v1App.getOpenAPI31Document
> =>
	v1App.getOpenAPI31Document({
		openapi: '3.1.0',
		info: { title: 'Sagat API', version: '1.0.0' },
	});

export default v1App;
