// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	AlertTriangle,
	Check,
	Copy,
	Info,
} from 'lucide-react';
import { type ReactNode } from 'react';

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { cn } from '@/lib/utils';

// The pieces both wizards (create a multisig, new proposal) share.

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

export type WizardStep = 1 | 2 | 3;

/** One label per step, to match `WizardStep`. */
export type WizardSteps = readonly [string, string, string];

/**
 * Where the wizard is. Every step up to `reach` (the furthest one whose
 * earlier steps are all valid) is a button, so a visitor can move around
 * without Back; the rest are plain. `disabled` holds every step, as while
 * the multisig or the proposal is being created. `testId` is the prefix of
 * the test ids: `<testId>-stepper`, `<testId>-stepper-compact` and
 * `<testId>-step-<n>`.
 */
export function WizardStepper({
	steps,
	step,
	reach,
	disabled = false,
	onStep,
	testId,
}: {
	steps: WizardSteps;
	step: WizardStep;
	reach: WizardStep;
	disabled?: boolean;
	onStep: (step: WizardStep) => void;
	testId: string;
}) {
	return (
		<div data-testid={`${testId}-stepper`} data-step={step}>
			{/* Phones: one line and a bar, since three labels don't fit. */}
			<div
				className="flex flex-col gap-2 sm:hidden"
				data-testid={`${testId}-stepper-compact`}
			>
				<p className="text-13">
					<span className="text-muted-foreground">
						Step {step} of {steps.length}
					</span>
					<span className="font-medium">
						{' '}
						· {steps[step - 1]}
					</span>
				</p>
				<div aria-hidden className="flex gap-1.5">
					{steps.map((label, i) => (
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
				{steps.map((label, i) => {
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
								data-testid={`${testId}-step-${n}`}
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
							{n < steps.length && (
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
 * here because the page header hides its own Cancel on phones. `testId`
 * is the wizard's prefix, as `WizardPage`'s: Cancel is
 * `<testId>-cancel-footer`.
 */
export function StepFooter({
	back,
	note,
	noteTestId,
	primary,
	onCancel,
	cancelDisabled = false,
	testId,
}: {
	back?: ReactNode;
	note?: ReactNode;
	noteTestId?: string;
	/** A button with `w-full sm:w-auto`. */
	primary: ReactNode;
	onCancel: () => void;
	cancelDisabled?: boolean;
	testId: string;
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
				data-testid={`${testId}-cancel-footer`}
			>
				Cancel
			</Button>
		</div>
	);
}

/** A footer note with an info icon, for `StepFooter`'s `note`. */
export function FooterNote({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<Info className="size-3 shrink-0" />
			{children}
		</span>
	);
}

/** A label and its value on one line, in a side card's list. */
export function SummaryRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-5.5 items-center justify-between gap-4 py-0.5">
			<dt className="shrink-0 text-13 text-muted-foreground">
				{label}
			</dt>
			<dd className="min-w-0 text-right">{children}</dd>
		</div>
	);
}

/** A side card of short answers, one open at a time. */
export function HelpAccordion({
	items,
	testId,
}: {
	items: readonly {
		id: string;
		question: string;
		answer: string;
	}[];
	testId: string;
}) {
	return (
		<Accordion
			className="rounded-xl border bg-card"
			data-testid={testId}
		>
			{items.map((item) => (
				<AccordionItem key={item.id} value={item.id}>
					<AccordionTrigger className="items-center gap-3 rounded-none px-5 py-3 text-13 font-normal hover:no-underline focus-visible:ring-inset **:data-[slot=accordion-trigger-icon]:size-3.5">
						{item.question}
					</AccordionTrigger>
					<AccordionContent className="px-5 pb-3 text-13 leading-normal text-muted-foreground">
						{item.answer}
					</AccordionContent>
				</AccordionItem>
			))}
		</Accordion>
	);
}

/** "What happens next": numbered steps, each a title and a line. */
export function NumberedSteps({
	items,
}: {
	items: { title: string; body: string }[];
}) {
	return (
		<ol className="flex flex-col gap-3">
			{items.map((item, i) => (
				<li key={item.title} className="flex gap-3">
					<span className="flex size-5.5 shrink-0 items-center justify-center rounded-full border border-foreground/15 text-11 leading-none text-foreground-secondary">
						{i + 1}
					</span>
					<div className="flex min-w-0 flex-col gap-0.5">
						<span className="text-14 font-medium">
							{item.title}
						</span>
						<p className="text-13 leading-normal text-muted-foreground">
							{item.body}
						</p>
					</div>
				</li>
			))}
		</ol>
	);
}
