// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ApiClient } from '@mysten/sagat';
import { SagatClient } from '@mysten/sagat-legacy';

const API_BASE_URL =
	import.meta.env.VITE_API_URL || 'http://localhost:3000';

// The `/v1` client. Calls move here from `legacyClient` as `/v1` routes
// land; `legacyClient` goes away with the last of them.
export const apiClient = new ApiClient({
	apiUrl: API_BASE_URL,
});

export const legacyClient = new SagatClient(
	API_BASE_URL,
	'cookie',
);
