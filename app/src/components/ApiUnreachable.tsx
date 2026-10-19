// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { CloudOff } from 'lucide-react';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { Button } from './ui/button';
import { EmptyState } from './ui/empty-state';

export function ApiUnreachable() {
	const { retryAuthCheck, isRetryingAuth } = useApiAuth();

	return (
		<EmptyState
			testId="api-unreachable"
			className="mx-auto mt-16 w-full max-w-lg"
			icon={CloudOff}
			title="Can't reach the service"
			description="The app couldn't connect to its API. Check your connection and try again."
			action={
				<Button
					onClick={retryAuthCheck}
					disabled={isRetryingAuth}
					data-testid="api-retry-button"
				>
					{isRetryingAuth ? 'Trying again...' : 'Try again'}
				</Button>
			}
		/>
	);
}
