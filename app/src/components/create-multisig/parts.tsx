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

import { Button } from '@/components/ui/button';
import { inputSizes } from '@/components/ui/input';
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
			{/* Focusable so a step change can move focus here. */}
			<h2
				tabIndex={-1}
				className="text-18 font-medium outline-none"
			>
				{title}
			</h2>
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
 * without Back; the rest are plain. `disabled` holds every step, as while
 * the multisig is being created.
 */
export function WizardStepper({
	step,
	reach,
	disabled = false,
	onStep,
}: {
	step: WizardStep;
	reach: WizardStep;
	disabled?: boolean;
	onStep: (step: WizardStep) => void;
}) {
	return (
		<div data-testid="create-stepper" data-step={step}>
			{/* Phones: one line and a bar, since three labels don't fit. */}
			<div
				className="flex flex-col gap-2 sm:hidden"
				data-testid="create-stepper-compact"
			>
				<p className="text-13">
					<span className="text-muted-foreground">
						Step {step} of {STEPS.length}
					</span>
					<span className="font-medium">
						{' '}
						· {STEPS[step - 1]}
					</span>
				</p>
				<div aria-hidden className="flex gap-1.5">
					{STEPS.map((label, i) => (
						<span
							key={label}
							className={cn(
								'h-1 flex-1 rounded-full transition-colors duration-200',
								i < step
									? 'bg-primary'
									: 'bg-foreground/15',
							)}
						/>
					))}
				</div>
			</div>
			<ol
				aria-label="Steps"
				className="flex items-center gap-3 max-sm:hidden"
			>
				{STEPS.map((label, i) => {
					const n = (i + 1) as WizardStep;
					const state =
						n < step
							? 'done'
							: n === step
								? 'current'
								: 'upcoming';
					const navigable =
						!disabled && n !== step && n <= reach;
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
										'flex size-5.5 shrink-0 items-center justify-center rounded-full text-11 leading-none transition-colors duration-200',
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
										'text-13 whitespace-nowrap transition-colors duration-200',
										state === 'current' && 'font-medium',
										state === 'upcoming' &&
											'text-muted-foreground',
									)}
								>
									{label}
									{state === 'done' && (
										<span className="sr-only"> (done)</span>
									)}
								</span>
							</button>
							{n < STEPS.length && (
								<span
									aria-hidden
									className={cn(
										'h-px w-10 transition-colors duration-200',
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
		</div>
	);
}

/**
 * Back on the left, a note and the primary action on the right. On phones
 * the primary spans the card with Back and Cancel under it; Cancel lives
 * here because the page header hides its own Cancel on phones.
 */
export function StepFooter({
	back,
	note,
	noteTestId,
	primary,
	onCancel,
	cancelDisabled = false,
}: {
	back?: ReactNode;
	note?: ReactNode;
	noteTestId?: string;
	/** A button with `w-full sm:w-auto`. */
	primary: ReactNode;
	onCancel: () => void;
	cancelDisabled?: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="order-3 mr-auto sm:order-1">
				{back}
			</div>
			{note && (
				<p
					className="order-1 basis-full text-12 text-muted-foreground sm:order-2 sm:basis-auto sm:text-right"
					data-testid={noteTestId}
				>
					{note}
				</p>
			)}
			<div className="order-2 basis-full sm:order-3 sm:basis-auto">
				{primary}
			</div>
			<Button
				type="button"
				variant="ghost"
				onClick={onCancel}
				disabled={cancelDisabled}
				className="order-4 sm:hidden"
				data-testid="create-cancel-footer"
			>
				Cancel
			</Button>
		</div>
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
				'inline-flex shrink-0 overflow-hidden rounded-md border border-foreground/12',
				size === 'sm' ? inputSizes.sm : inputSizes.lg,
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
