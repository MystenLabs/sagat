// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Check } from 'lucide-react';
import { type ReactNode } from 'react';

import { DismissButton } from '../ui/dismiss-button';

/** A dismissible green note at the top of a page, after a flow ends. */
export function SuccessBanner({
	children,
	onDismiss,
	testId,
}: {
	children: ReactNode;
	onDismiss: () => void;
	testId: string;
}) {
	return (
		<div
			role="status"
			className="mb-6 flex items-center gap-2.5 rounded-lg bg-success-soft px-4 py-3 text-14 font-medium text-success-foreground"
			data-testid={testId}
		>
			<Check
				className="size-4 shrink-0"
				strokeWidth={2.5}
			/>
			<span className="min-w-0 flex-1">{children}</span>
			<DismissButton
				onClick={onDismiss}
				className="opacity-70 hover:opacity-100"
				iconClassName="size-3.5"
				data-testid={`${testId}-dismiss`}
			/>
		</div>
	);
}
