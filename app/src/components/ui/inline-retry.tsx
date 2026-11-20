// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '@/content';

import { Button } from './button';

/** "Try again" after a sentence, as a link; "Trying again…" while it runs. */
export function InlineRetry({
	onRetry,
	retrying,
	testId,
}: {
	onRetry: () => void;
	retrying: boolean;
	testId: string;
}) {
	return (
		<Button
			variant="link"
			size="xs"
			onClick={onRetry}
			disabled={retrying}
			className="h-auto border-0 px-0 text-13 text-inherit underline hover:no-underline"
			data-testid={testId}
		>
			{retrying
				? content.common.states.retrying
				: content.common.actions.tryAgain}
		</Button>
	);
}
