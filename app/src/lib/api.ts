// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ApiClient } from '@mysten/sagat';

const API_BASE_URL =
	import.meta.env.VITE_API_URL || 'http://localhost:3000';

// The `/v1` client, on the session cookie set by `connect()`.
export const apiClient = new ApiClient({
	apiUrl: API_BASE_URL,
});
