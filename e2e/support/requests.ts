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

/** Whether `response` is a load of `publicKey`'s invitations inbox. */
export function isInboxRead(
	response: Response,
	publicKey: string,
) {
	const { pathname, searchParams } = new URL(
		response.url(),
	);
	return (
		response.request().method() === 'GET' &&
		pathname.endsWith(
			`/addresses/invitations/${encodeURIComponent(publicKey)}`,
		) &&
		!searchParams.has('showRejected')
	);
}
