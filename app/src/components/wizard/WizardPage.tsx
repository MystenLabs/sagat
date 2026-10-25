// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, type Ref } from 'react';

import { Button } from '@/components/ui/button';
import {
	PageHeader,
	type Crumb,
} from '@/components/ui/page-header';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { WizardStepper, type WizardStep } from './parts';

/**
 * The frame both wizards share: the header with Cancel, the stepper, and
 * the step's card beside the side column. The page keeps the steps and
 * their state. `testId` is the prefix of the test ids: `<testId>-page`,
 * `<testId>-cancel` and the stepper's.
 */
export function WizardPage({
	title,
	breadcrumb,
	testId,
	steps,
	step,
	reach,
	onStep,
	busy,
	onCancel,
	direction,
	cardRef,
	beforeContent,
	sideKey,
	sideClassName = '@4xl:w-80',
	side,
	children,
}: {
	title: string;
	breadcrumb: Crumb[];
	testId: string;
	steps: readonly [string, string, string];
	step: WizardStep;
	reach: WizardStep;
	onStep: (step: WizardStep) => void;
	/** Holds Cancel and the stepper, as while creating. */
	busy: boolean;
	onCancel: () => void;
	/** Which way the last step change went; the card slides in from it. */
	direction: 'forward' | 'back';
	cardRef: Ref<HTMLDivElement>;
	/** Between the stepper and the row. */
	beforeContent?: ReactNode;
	/** The side column fades in again when this changes. */
	sideKey: string;
	/** The side column's width from two columns on. */
	sideClassName?: string;
	side: ReactNode;
	/** The step's card. */
	children: ReactNode;
}) {
	return (
		<TooltipProvider delay={150}>
			<div
				className="page-shell @container"
				data-testid={`${testId}-page`}
			>
				<PageHeader
					breadcrumb={breadcrumb}
					title={title}
					actions={
						<Button
							variant="ghost"
							onClick={onCancel}
							disabled={busy}
							className="max-sm:hidden"
							data-testid={`${testId}-cancel`}
						>
							Cancel
						</Button>
					}
				/>

				<WizardStepper
					steps={steps}
					step={step}
					reach={reach}
					disabled={busy}
					onStep={onStep}
					testId={testId}
				/>
				{beforeContent}

				{/* Stacked below 896px of content, where the card and the side
				    cards fill the row; two columns from there, the card taking
				    what the side column leaves. */}
				<div className="mt-7 flex flex-col gap-8 @4xl:flex-row @4xl:items-start">
					<div
						// Remounting on each step change plays the entrance.
						key={step}
						ref={cardRef}
						className={cn(
							'@container/card w-full min-w-0 rounded-xl border bg-card @4xl:flex-1',
							'animate-in fade-in duration-200 ease-out motion-reduce:animate-none',
							direction === 'forward'
								? 'slide-in-from-right-2'
								: 'slide-in-from-left-2',
						)}
					>
						{children}
					</div>

					<div
						key={sideKey}
						className={cn(
							'flex w-full flex-col gap-5 animate-in fade-in duration-200 motion-reduce:animate-none @4xl:shrink-0',
							sideClassName,
						)}
					>
						{side}
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}
