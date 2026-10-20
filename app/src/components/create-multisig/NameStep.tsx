// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	NAME_MAX,
	nameError,
	textLength,
} from '@/lib/create-multisig';
import { cn } from '@/lib/utils';

import {
	disabledButton,
	Divider,
	SectionHeading,
} from './parts';

/** Step 1: the name every signer sees in their invitation. */
export function NameStep({
	name,
	onNameChange,
	onContinue,
}: {
	name: string;
	onNameChange: (name: string) => void;
	onContinue: () => void;
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
				<label
					htmlFor="create-name"
					className="text-13 font-medium"
				>
					Multisig name
				</label>
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
					className="h-10.5 rounded-md border-foreground/12 bg-card px-3 text-14 placeholder:text-muted-foreground/70 focus-visible:border-foreground focus-visible:ring-0 md:text-14 aria-invalid:border-error-foreground aria-invalid:ring-0 dark:bg-card"
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
			<div className="flex justify-end">
				<Button
					type="submit"
					disabled={!!error}
					className={disabledButton}
					data-testid="create-continue"
				>
					Continue
				</Button>
			</div>
		</form>
	);
}
