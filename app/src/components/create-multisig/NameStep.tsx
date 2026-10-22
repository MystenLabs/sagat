// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';

import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	NAME_MAX,
	nameError,
	textLength,
} from '@/lib/create-multisig';
import { cn } from '@/lib/utils';

import {
	Divider,
	SectionHeading,
	StepFooter,
} from './parts';

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
	// "Give it a name" waits until the field has been used; too long
	// shows at once.
	const [touched, setTouched] = useState(name !== '');
	const error = nameError(name);
	const length = textLength(name);
	const shownError =
		error && (touched || length > NAME_MAX) ? error : null;

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
				title="Name your multisig"
				description="Signers see this name in their invitation."
			/>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="create-name">Multisig name</Label>
				<Input
					id="create-name"
					value={name}
					onChange={(e) => {
						onNameChange(e.target.value);
						setTouched(true);
					}}
					onBlur={() => setTouched(true)}
					placeholder="e.g. Treasury Operations"
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
						`${length} of ${NAME_MAX} characters`}
				</p>
			</div>
			<Divider />
			<StepFooter
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
						Continue
					</Button>
				}
			/>
		</form>
	);
}
