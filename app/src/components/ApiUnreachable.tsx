// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { CloudOff } from 'lucide-react';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { ErrorState } from './ui/empty-state';

export function ApiUnreachable() {
	const { retryAuthCheck, isRetryingAuth } = useApiAuth();

	return (
		<ErrorState
			testId="api-unreachable"
			className="mx-auto mt-16 w-full max-w-lg"
			icon={CloudOff}
			title="Can't reach the service"
			fallback="The app couldn't connect to its API. Check your connection and try again."
			onRetry={retryAuthCheck}
			retrying={isRetryingAuth}
			retryTestId="api-retry-button"
		/>
	);
}
