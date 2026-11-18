// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { createV1App } from './openapi';
import { proposalRoutes } from './proposals';

const v1App = createV1App();

proposalRoutes(v1App);

export const getV1OpenAPIDocument = (): ReturnType<
	typeof v1App.getOpenAPI31Document
> =>
	v1App.getOpenAPI31Document({
		openapi: '3.1.0',
		info: { title: 'Sagat API', version: '1.0.0' },
	});

export default v1App;
