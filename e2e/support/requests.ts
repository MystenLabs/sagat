// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Matchers for the node and API requests specs wait on or intercept.
import { deriveAliasesObjectId } from '@mysten/sagat';
import {
	type Page,
	type Request,
	type Response,
	type Route,
} from '@playwright/test';

const BATCH_GET_OBJECTS =
	'**/sui.rpc.v2.LedgerService/BatchGetObjects';

/** Whether `request` is a node read of `pod`'s alias set. */
export function isAliasRead(request: Request, pod: string) {
	return Buffer.from(request.postData() ?? '', 'base64')
		.toString('latin1')
		.includes(deriveAliasesObjectId(pod));
}

/**
 * Hands the page's node reads of `pod`'s alias set to `handle`; returns a
 * function that stops it.
 */
export async function routeAliasReads(
	page: Page,
	pod: string,
	handle: (route: Route) => Promise<unknown>,
) {
	const handler = (route: Route) =>
		isAliasRead(route.request(), pod)
			? handle(route)
			: route.fallback();
	await page.route(BATCH_GET_OBJECTS, handler);
	return () => page.unroute(BATCH_GET_OBJECTS, handler);
}

/** Whether `response` is a load of the invitations inbox; one load covers every key of the session. */
export function isInboxRead(response: Response) {
	const { pathname, searchParams } = new URL(
		response.url(),
	);
	return (
		response.request().method() === 'GET' &&
		pathname.endsWith('/v1/invitations') &&
		!searchParams.has('showRejected')
	);
}

/** Whether `response` is a successful load of the account list. */
export function isAccountListRead(response: Response) {
	return (
		response.request().method() === 'GET' &&
		new URL(response.url()).pathname.endsWith(
			'/v1/accounts',
		) &&
		response.ok()
	);
}
