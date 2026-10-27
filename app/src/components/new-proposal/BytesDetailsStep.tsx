// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';

import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
	FieldStatus,
	FooterNote,
	SectionHeading,
	StepFooter,
} from '@/components/wizard/parts';
import { useTouched } from '@/components/wizard/use-touched';
import { accountName } from '@/lib/account-name';
import {
	bytesStatusText,
	checkBytes,
	COPY,
	titleError,
	type ReadyProposal,
} from '@/lib/new-proposal';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

import { TitleField } from './TitleField';

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
	onReady: (ready: ReadyProposal) => void;
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
		check.kind === 'unresolved' ||
		check.kind === 'wrong-sender';

	const value = title ?? '';
	const currentTitleError = titleError(value);
	// Like the transfer: the title's error waits until the field is used.
	const { touched, touch, change } = useTouched({
		title: value !== '',
	});
	const shownTitleError = touched.title
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
					placeholder={COPY.bytesPlaceholder}
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
					<FieldStatus
						id="bytes-status"
						valid={check.kind === 'ok'}
						state={check.kind}
						testId="bytes-status"
					>
						{status}
					</FieldStatus>
				)}
			</div>

			<TitleField
				value={value}
				placeholder={COPY.titlePlaceholder}
				hint={COPY.titleHintBytes}
				error={shownTitleError}
				onChange={(next) => {
					change('title', value);
					onTitleChange(next);
				}}
				onBlur={() => touch('title')}
			/>

			<Separator />

			<StepFooter
				onCancel={onCancel}
				testId="new-proposal"
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
				note={<FooterNote>{COPY.bytesNote}</FooterNote>}
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
