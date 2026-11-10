// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { TriangleAlert } from 'lucide-react';

import { content } from '@/content';

import { ErrorState } from './ui/empty-state';

const COPY = content.states;

/** A routed page failed to render; the shell around it still works. */
export function PageCrashed({
	onRetry,
}: {
	onRetry: () => void;
}) {
	return (
		<div className="px-5">
			<ErrorState
				testId="page-crashed"
				className="mx-auto mt-16 w-full max-w-lg"
				icon={TriangleAlert}
				title={COPY.pageCrashed.title}
				fallback={COPY.pageCrashed.body}
				onRetry={onRetry}
				retryTestId="page-crashed-retry"
			/>
		</div>
	);
}

/** The whole app failed to render: no router, shell or providers to lean on. */
export function AppCrashed() {
	return (
		<div className="flex min-h-svh items-center justify-center bg-background p-5">
			<ErrorState
				testId="app-crashed"
				className="w-full max-w-lg"
				icon={TriangleAlert}
				title={COPY.error.title}
				fallback={COPY.appCrashed.body}
				onRetry={() => window.location.reload()}
				retryLabel={content.common.actions.reloadPage}
				retryTestId="app-crashed-reload"
			/>
		</div>
	);
}
