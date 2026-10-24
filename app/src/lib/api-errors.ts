// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SagatApiError } from '@mysten/sagat';

// The API's refusals worth showing as they are.
const SHOWN_STATUSES = [400, 409, 422];

/**
 * The message to show for a failed API call: the API's own reason when it
 * refused the request (400, 409 or 422), `fallback` for anything else
 * (offline, 5xx, auth).
 */
export function shownApiError(
	error: unknown,
	fallback: string,
): string {
	return error instanceof SagatApiError &&
		SHOWN_STATUSES.includes(error.status)
		? error.message
		: fallback;
}
