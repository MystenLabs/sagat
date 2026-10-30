// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { content } from '@/content';
import { cn } from '@/lib/utils';

/** The proposal's title on Details, with its hint or its error below. */
export function TitleField({
	value,
	placeholder,
	hint,
	error,
	onChange,
	onBlur,
	disabled = false,
}: {
	value: string;
	placeholder: string;
	hint: string;
	/** Shown in place of the hint; null until the field is touched. */
	error: string | null;
	onChange: (title: string) => void;
	onBlur: () => void;
	disabled?: boolean;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor="proposal-title">
				{content.newProposal.titleLabel}
			</Label>
			<Input
				id="proposal-title"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onBlur={onBlur}
				placeholder={placeholder}
				disabled={disabled}
				autoComplete="off"
				aria-invalid={!!error}
				aria-describedby="proposal-title-hint"
				data-testid="proposal-title-input"
			/>
			<p
				id="proposal-title-hint"
				className={cn(
					'text-12',
					error
						? 'text-error-foreground'
						: 'text-muted-foreground',
				)}
				data-state={error ? 'error' : undefined}
				data-testid="proposal-title-hint"
			>
				{error ?? hint}
			</p>
		</div>
	);
}
