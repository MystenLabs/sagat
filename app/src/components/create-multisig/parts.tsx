// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	AlertTriangle,
	Check,
	Copy,
	Minus,
	Plus,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { clamp } from '@/lib/create-multisig';
import { cn } from '@/lib/utils';

/** The designs' disabled button: grey fill and label, not faded. */
export const disabledButton =
	'disabled:bg-muted disabled:text-muted-foreground/70 disabled:opacity-100';

export function SectionHeading({
	title,
	description,
	className,
}: {
	title: string;
	description: string;
	className?: string;
}) {
	return (
		<div className={cn('flex flex-col gap-1', className)}>
			<h2 className="text-18 font-medium">{title}</h2>
			<p className="text-14 text-muted-foreground">
				{description}
			</p>
		</div>
	);
}

export function Divider() {
	return <div className="h-px w-full bg-border" />;
}

/** A yellow or red note with an alert icon. */
export function Notice({
	tone,
	children,
	testId,
	className,
}: {
	tone: 'warning' | 'error';
	children: ReactNode;
	testId?: string;
	className?: string;
}) {
	return (
		<div
			role={tone === 'error' ? 'alert' : 'status'}
			className={cn(
				'flex items-start gap-2.5 rounded-lg px-3 py-2',
				tone === 'warning'
					? 'bg-warning text-12 text-warning-foreground'
					: 'bg-error text-13 text-error-foreground',
				className,
			)}
			data-testid={testId}
		>
			<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
			<p className="leading-normal">{children}</p>
		</div>
	);
}

/** "Copy" as text, which turns into "Copied" for a moment. */
export function CopyText({
	value,
	label,
	testId,
}: {
	value: string;
	label: string;
	testId?: string;
}) {
	const { copied, copy } = useCopyToClipboard(null);
	return (
		<button
			type="button"
			onClick={() => copy(value)}
			className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-12 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
			data-testid={testId}
		>
			{copied ? (
				<Check className="size-3 text-success-foreground" />
			) : (
				<Copy className="size-3 opacity-50" />
			)}
			{copied ? 'Copied' : label}
		</button>
	);
}

const STEPS = ['Name', 'Signers and threshold', 'Review'];

export type WizardStep = 1 | 2 | 3;

/**
 * Where the wizard is. Every step up to `reach` (the furthest one whose
 * earlier steps are all valid) is a button, so a visitor can move around
 * without Back; the rest are plain.
 */
export function WizardStepper({
	step,
	reach,
	onStep,
}: {
	step: WizardStep;
	reach: WizardStep;
	onStep: (step: WizardStep) => void;
}) {
	return (
		<ol
			aria-label="Steps"
			className="flex items-center gap-3"
			data-testid="create-stepper"
			data-step={step}
		>
			{STEPS.map((label, i) => {
				const n = (i + 1) as WizardStep;
				const state =
					n < step
						? 'done'
						: n === step
							? 'current'
							: 'upcoming';
				const navigable = n !== step && n <= reach;
				return (
					<li
						key={label}
						className="flex items-center gap-3"
						aria-current={
							state === 'current' ? 'step' : undefined
						}
					>
						<button
							type="button"
							disabled={!navigable}
							onClick={() => onStep(n)}
							className={cn(
								'flex items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
								navigable &&
									'cursor-pointer hover:[&>span:last-child]:underline',
							)}
							data-testid={`create-step-${n}`}
						>
							<span
								className={cn(
									'flex size-5.5 shrink-0 items-center justify-center rounded-full text-11 leading-none',
									state === 'upcoming'
										? 'border border-foreground/15 text-muted-foreground'
										: 'bg-primary text-primary-foreground',
								)}
							>
								{state === 'done' ? (
									<Check
										className="size-3"
										strokeWidth={2.5}
									/>
								) : (
									n
								)}
							</span>
							<span
								className={cn(
									'text-13 whitespace-nowrap',
									state === 'current'
										? 'font-medium'
										: 'max-sm:sr-only',
									state === 'upcoming' &&
										'text-muted-foreground',
								)}
							>
								{label}
							</span>
						</button>
						{n < STEPS.length && (
							<span
								aria-hidden
								className={cn(
									'h-px w-10 max-sm:w-6',
									n < step
										? 'bg-foreground'
										: 'bg-foreground/15',
								)}
							/>
						)}
					</li>
				);
			})}
		</ol>
	);
}

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
				'inline-flex shrink-0 overflow-hidden border border-foreground/12',
				size === 'sm'
					? 'h-9.5 rounded-md'
					: 'h-11.5 rounded-lg',
			)}
		>
			<button
				type="button"
				aria-label={`Decrease ${label.toLowerCase()}`}
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
				aria-label={`Increase ${label.toLowerCase()}`}
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
