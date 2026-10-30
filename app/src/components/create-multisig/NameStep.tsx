// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
	SectionHeading,
	StepFooter,
} from '@/components/wizard/parts';
import { useTouched } from '@/components/wizard/use-touched';
import { content } from '@/content';
import {
	NAME_MAX,
	nameError,
	textLength,
} from '@/lib/create-multisig';
import { cn } from '@/lib/utils';

/** Step 1: the name every signer sees in their invitation. */
export function NameStep({
	name,
	onNameChange,
	onContinue,
	onCancel,
}: {
	name: string;
	onNameChange: (name: string) => void;
	onContinue: () => void;
	onCancel: () => void;
}) {
	// "Give it a name" waits until the field has been used
	// (`useTouched`); too long shows at once.
	const { touched, touch, change } = useTouched({
		name: name !== '',
	});
	const error = nameError(name);
	const length = textLength(name);
	const shownError =
		error && (touched.name || length > NAME_MAX)
			? error
			: null;

	return (
		<form
			className="flex flex-col gap-5.5 p-5 md:p-8"
			onSubmit={(e) => {
				e.preventDefault();
				if (!error) onContinue();
			}}
			data-testid="create-name-step"
		>
			<SectionHeading
				title={content.createMultisig.nameStep.title}
				description={
					content.createMultisig.nameStep.description
				}
			/>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="create-name">
					{content.createMultisig.nameStep.label}
				</Label>
				<Input
					id="create-name"
					value={name}
					onChange={(e) => {
						change('name', name);
						onNameChange(e.target.value);
					}}
					onBlur={() => touch('name')}
					placeholder={
						content.createMultisig.nameStep.placeholder
					}
					autoFocus
					aria-invalid={!!shownError}
					aria-describedby="create-name-hint"
					data-testid="create-name-input"
				/>
				<p
					id="create-name-hint"
					className={cn(
						'text-12',
						shownError
							? 'text-error-foreground'
							: 'text-muted-foreground',
					)}
					data-testid="create-name-hint"
				>
					{shownError ??
						content.createMultisig.nameStep.count(
							length,
							NAME_MAX,
						)}
				</p>
			</div>
			<Separator />
			<StepFooter
				testId="create"
				onCancel={onCancel}
				primary={
					<Button
						type="submit"
						disabled={!!error}
						className={cn(
							disabledButton,
							'w-full sm:w-auto',
						)}
						data-testid="create-continue"
					>
						{content.common.continue}
					</Button>
				}
			/>
		</form>
	);
}
