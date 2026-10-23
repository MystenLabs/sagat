// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import {
	FileCode2,
	Info,
	Send,
	type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
	Divider,
	SectionHeading,
	StepFooter,
} from '@/components/wizard/parts';
import {
	COPY,
	PROPOSAL_TYPES,
	type ProposalType,
} from '@/lib/new-proposal';

const ICONS: Record<ProposalType, LucideIcon> = {
	transfer: Send,
	bytes: FileCode2,
};

/** Step 1: what the proposal does. */
export function TypeStep({
	type,
	onTypeChange,
	onContinue,
	onCancel,
}: {
	type: ProposalType;
	onTypeChange: (type: ProposalType) => void;
	onContinue: () => void;
	onCancel: () => void;
}) {
	return (
		<form
			className="flex flex-col gap-5.5 p-5 md:p-8"
			onSubmit={(e) => {
				e.preventDefault();
				onContinue();
			}}
			data-testid="type-step"
		>
			<SectionHeading
				title="Choose a type"
				description="What should this proposal do? Signers see the type in the proposal list."
			/>
			<RadioGroup
				value={type}
				onValueChange={(value) =>
					onTypeChange(value as ProposalType)
				}
				aria-label="Proposal type"
				className="flex flex-col gap-3"
			>
				{PROPOSAL_TYPES.map((option) => {
					const Icon = ICONS[option.id];
					return (
						<Radio.Root
							key={option.id}
							value={option.id}
							aria-labelledby={`proposal-type-${option.id}-title`}
							aria-describedby={`proposal-type-${option.id}-description`}
							className="flex cursor-pointer items-center gap-3 rounded-lg border border-foreground/15 p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring data-checked:border-foreground data-checked:ring-1 data-checked:ring-foreground data-checked:focus-visible:ring-2"
							data-testid={`proposal-type-${option.id}`}
						>
							<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
								<Icon className="size-4" />
							</span>
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span
									id={`proposal-type-${option.id}-title`}
									className="text-14 font-medium"
								>
									{option.title}
								</span>
								<span
									id={`proposal-type-${option.id}-description`}
									className="text-13 leading-normal text-muted-foreground"
								>
									{option.description}
								</span>
							</span>
							{/* The radio dot: a ring, filled in when chosen. */}
							<span
								aria-hidden
								className="flex size-4 shrink-0 items-center justify-center rounded-full border border-foreground/15 transition-colors in-data-checked:border-foreground"
							>
								<Radio.Indicator className="size-2 rounded-full bg-foreground" />
							</span>
						</Radio.Root>
					);
				})}
			</RadioGroup>
			<Divider />
			<StepFooter
				cancelTestId="new-proposal-cancel-footer"
				onCancel={onCancel}
				note={
					<span className="inline-flex items-center gap-1.5">
						<Info className="size-3 shrink-0" />
						{COPY.typeNote}
					</span>
				}
				primary={
					<Button
						type="submit"
						className="w-full sm:w-auto"
						data-testid="type-continue"
					>
						Continue
					</Button>
				}
			/>
		</form>
	);
}
