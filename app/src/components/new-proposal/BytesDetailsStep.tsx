// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft, Check, Info } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
	Divider,
	SectionHeading,
	StepFooter,
} from '@/components/wizard/parts';
import { accountName } from '@/lib/account-name';
import {
	bytesStatusText,
	checkBytes,
	COPY,
	titleError,
} from '@/lib/new-proposal';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Step 2 for pasted bytes: the bytes, read at once, and a title. */
export function BytesDetailsStep({
	multisig,
	draft,
	onDraftChange,
	title,
	onTitleChange,
	onReady,
	onBack,
	onCancel,
}: {
	multisig: MultisigWithMembersForPublicKey;
	draft: string;
	onDraftChange: (draft: string) => void;
	title: string | null;
	onTitleChange: (title: string) => void;
	onReady: (ready: {
		bytes: string;
		title: string;
	}) => void;
	onBack: () => void;
	onCancel: () => void;
}) {
	const check = useMemo(
		() => checkBytes(draft, multisig.address),
		[draft, multisig.address],
	);
	const status = bytesStatusText(
		check,
		accountName(multisig),
	);
	const bytesInvalid =
		check.kind === 'unreadable' ||
		check.kind === 'wrong-sender';

	const value = title ?? '';
	const currentTitleError = titleError(value);
	// Like the transfer: the title's error waits until the field is used.
	const [titleTouched, setTitleTouched] = useState(
		value !== '',
	);
	const shownTitleError = titleTouched
		? currentTitleError
		: null;

	const canReview =
		check.kind === 'ok' && !currentTitleError;

	return (
		<form
			className="flex flex-col gap-5.5 p-5 md:p-8"
			onSubmit={(e) => {
				e.preventDefault();
				if (canReview && check.kind === 'ok')
					onReady({
						bytes: check.bytes,
						title: value.trim(),
					});
			}}
			noValidate
			data-testid="bytes-step"
		>
			<SectionHeading
				title="Transaction bytes"
				description="Paste a transaction built somewhere else. It is read and simulated before anyone signs."
			/>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="proposal-bytes">Bytes</Label>
				<Textarea
					id="proposal-bytes"
					value={draft}
					onChange={(e) => onDraftChange(e.target.value)}
					placeholder="Paste the base64 transaction bytes"
					autoComplete="off"
					spellCheck={false}
					aria-invalid={bytesInvalid || undefined}
					aria-describedby={
						status ? 'bytes-status' : undefined
					}
					className="h-30 resize-none font-mono break-all md:text-12"
					data-testid="bytes-input"
				/>
				{status && (
					<p
						id="bytes-status"
						className={cn(
							'flex items-start gap-1 text-12',
							bytesInvalid
								? 'text-error-foreground'
								: 'text-success-foreground',
						)}
						data-state={check.kind}
						data-testid="bytes-status"
					>
						{check.kind === 'ok' && (
							<Check
								className="mt-0.5 size-3 shrink-0"
								strokeWidth={2.5}
							/>
						)}
						{status}
					</p>
				)}
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="proposal-title">Title</Label>
				<Input
					id="proposal-title"
					value={value}
					onChange={(e) => {
						setTitleTouched(true);
						onTitleChange(e.target.value);
					}}
					onBlur={() => setTitleTouched(true)}
					placeholder={COPY.titlePlaceholder}
					autoComplete="off"
					aria-invalid={!!shownTitleError}
					aria-describedby="proposal-title-hint"
					data-testid="proposal-title-input"
				/>
				<p
					id="proposal-title-hint"
					className={cn(
						'text-12',
						shownTitleError
							? 'text-error-foreground'
							: 'text-muted-foreground',
					)}
					data-state={shownTitleError ? 'error' : undefined}
					data-testid="proposal-title-hint"
				>
					{shownTitleError ?? COPY.titleHintBytes}
				</p>
			</div>

			<Divider />

			<StepFooter
				onCancel={onCancel}
				cancelTestId="new-proposal-cancel-footer"
				back={
					<Button
						type="button"
						variant="ghost"
						onClick={onBack}
						className={disabledButton}
						data-testid="details-back"
					>
						<ArrowLeft />
						Back
					</Button>
				}
				note={
					<span className="inline-flex items-center gap-1.5">
						<Info className="size-3 shrink-0" />
						{COPY.bytesNote}
					</span>
				}
				primary={
					<Button
						type="submit"
						disabled={!canReview}
						className={cn(
							disabledButton,
							'w-full sm:w-auto',
						)}
						data-testid="bytes-review"
					>
						Review
					</Button>
				}
			/>
		</form>
	);
}
