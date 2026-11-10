// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

import { inputSizes } from '@/components/ui/input';
import { content } from '@/content';
import { clamp } from '@/lib/create-multisig';
import { cn } from '@/lib/utils';

/**
 * Minus, a typeable value and plus. Values in range apply as you type;
 * anything else snaps to the nearest bound when the field loses focus.
 */
export function NumberStepper({
	value,
	min,
	max,
	onChange,
	label,
	size,
	testId,
}: {
	value: number;
	min: number;
	max: number;
	onChange: (value: number) => void;
	/** For screen readers: "Weight", "Threshold". */
	label: string;
	size: 'sm' | 'lg';
	testId: string;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const commit = () => {
		if (draft === null) return;
		if (draft !== '')
			onChange(clamp(Number(draft), min, max));
		setDraft(null);
	};

	const button = cn(
		'flex cursor-pointer items-center justify-center bg-card text-muted-foreground outline-none hover:text-foreground focus-visible:bg-muted disabled:cursor-default disabled:text-foreground/15',
		size === 'sm'
			? 'w-7.5'
			: 'w-10.5 text-foreground-secondary',
	);
	const icon = size === 'sm' ? 'size-3' : 'size-4';

	return (
		<div
			className={cn(
				'inline-flex shrink-0 overflow-hidden rounded-md border border-foreground/12',
				size === 'sm' ? inputSizes.sm : inputSizes.lg,
			)}
		>
			<button
				type="button"
				aria-label={content.createMultisig.stepper.decrease(
					label,
				)}
				disabled={value <= min}
				onClick={() => onChange(clamp(value - 1, min, max))}
				className={button}
				data-testid={`${testId}-decrease`}
			>
				<Minus className={icon} />
			</button>
			<input
				inputMode="numeric"
				aria-label={label}
				value={draft ?? String(value)}
				onChange={(e) => {
					const digits = e.target.value.replace(/\D/g, '');
					setDraft(digits);
					const next = Number(digits);
					if (digits && next >= min && next <= max)
						onChange(next);
				}}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === 'Enter') commit();
				}}
				className={cn(
					'min-w-0 border-x border-foreground/12 bg-card text-center outline-none focus-visible:bg-muted',
					size === 'sm'
						? 'w-8.5 text-13'
						: 'w-15 text-20 font-medium',
				)}
				data-testid={testId}
			/>
			<button
				type="button"
				aria-label={content.createMultisig.stepper.increase(
					label,
				)}
				disabled={value >= max}
				onClick={() => onChange(clamp(value + 1, min, max))}
				className={button}
				data-testid={`${testId}-increase`}
			>
				<Plus className={icon} />
			</button>
		</div>
	);
}
