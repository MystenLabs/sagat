// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Check } from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The line under a field: green with a check when the value is fine,
 * red when it isn't, saying why.
 */
export function FieldStatus({
	id,
	valid,
	state,
	testId,
	children,
}: {
	id: string;
	valid: boolean;
	/** Its `data-state`. */
	state: string;
	testId: string;
	children: ReactNode;
}) {
	return (
		<p
			id={id}
			className={cn(
				'flex items-start gap-1 text-12',
				valid
					? 'text-success-foreground'
					: 'text-error-foreground',
			)}
			data-state={state}
			data-testid={testId}
		>
			{valid && (
				<Check
					className="mt-0.5 size-3 shrink-0"
					strokeWidth={2.5}
				/>
			)}
			{children}
		</p>
	);
}
