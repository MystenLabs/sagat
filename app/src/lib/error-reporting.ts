// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SagatApiError } from '@mysten/sagat';
import { RpcError } from '@mysten/sui/grpc';
import { isCancelledError } from '@tanstack/react-query';
import type { ErrorInfo } from 'react';

import { isApiFetchFailure } from './api';
import { reportError } from './sentry';
import { SimulationFailedError } from './transaction-preview';
import {
	isWalletDecline,
	SignatureDeclinedError,
	SignInCancelledError,
	WalletDeclinedError,
} from './wallet-session';

export type ErrorSource = 'rpc' | 'api' | 'wallet' | 'app';

/** Failures that are an answer rather than a fault, and are not reported. */
export function isExpectedError(error: unknown): boolean {
	if (error instanceof SagatApiError)
		return error.status < 500;
	// A node's wording can read like a decline.
	if (error instanceof RpcError) return false;
	return (
		isWalletDecline(error) ||
		(error instanceof Error &&
			error.name === 'AbortError') ||
		isCancelledError(error) ||
		error instanceof SignInCancelledError ||
		error instanceof SimulationFailedError
	);
}

export function errorSource(error: unknown): ErrorSource {
	if (
		error instanceof SagatApiError ||
		isApiFetchFailure(error)
	)
		return 'api';
	if (error instanceof RpcError) return 'rpc';
	if (
		error instanceof WalletDeclinedError ||
		error instanceof SignatureDeclinedError
	)
		return 'wallet';
	return 'app';
}

type Site =
	| { query: string }
	| { mutation: string }
	| { operation: string };

export function reportUnexpected(
	error: unknown,
	tags: { source?: ErrorSource } & Site,
) {
	if (isExpectedError(error)) return;
	const { source, ...site } = tags;
	const siteValue = Object.values(site)[0] as string;
	reportError(error, {
		tags: {
			source: source ?? errorSource(error),
			...site,
			...(error instanceof SagatApiError
				? { status: String(error.status) }
				: {}),
			...(error instanceof RpcError
				? { rpc_code: error.code }
				: {}),
		},
		fingerprint: ['{{ default }}', siteValue],
	});
}

/** A render crash caught by an error boundary; always reported. */
export function reportCrash(
	error: unknown,
	info: ErrorInfo,
	boundary: 'page' | 'app',
) {
	reportError(error, {
		tags: { source: 'app', boundary },
		componentStack: info.componentStack,
	});
}
