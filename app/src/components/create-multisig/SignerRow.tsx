// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
	AlertTriangle,
	Check,
	GripVertical,
	Search,
	Trash2,
	X,
} from 'lucide-react';

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { Input } from '@/components/ui/input';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { CONFIG } from '@/lib/constants';
import {
	type SignerCheck,
	type SignerDraft,
} from '@/lib/create-multisig';
import { cn } from '@/lib/utils';

import { NumberStepper } from './parts';

const LABEL_MAX = CONFIG.MAX_KEY_LABEL_LENGTH;
// The label counter shows from here on.
const LABEL_NEAR = LABEL_MAX - 8;

const field =
	'h-9.5 rounded-md border-foreground/12 bg-card text-14 placeholder:text-muted-foreground/70 focus-visible:border-foreground focus-visible:ring-0 md:text-14 dark:bg-card';

/**
 * One signer: drag handle, name, key, weight and remove. The creator's
 * key is their wallet's and read-only; their name is theirs to edit.
 */
export function SignerRow({
	signer,
	check,
	index,
	autoFocus,
	onChange,
	onRemove,
}: {
	signer: SignerDraft;
	check: SignerCheck;
	index: number;
	autoFocus: boolean;
	onChange: (changes: Partial<SignerDraft>) => void;
	onRemove: () => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: signer.id });
	const { status } = check;
	const creator = !!signer.isCreator;

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
			}}
			className={cn(
				'relative flex flex-col gap-1.5 rounded-lg border bg-muted/50 px-3 py-2.5 focus-within:border-foreground/55',
				isDragging && 'z-10 border-foreground/55 bg-card',
			)}
			data-testid="create-signer-row"
			data-status={status.kind}
		>
			<div className="flex flex-wrap items-center gap-2.5 @xl/card:flex-nowrap">
				<div className="flex w-9 shrink-0 items-center gap-1.5 text-12 text-muted-foreground">
					<Tooltip>
						<TooltipTrigger
							render={
								<button
									type="button"
									ref={setActivatorNodeRef}
									{...attributes}
									{...listeners}
								/>
							}
							aria-label={`Drag to reorder signer ${index + 1}`}
							className="-ml-1 flex cursor-grab touch-none items-center rounded-sm p-0.5 text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
							data-testid="create-signer-drag"
						>
							<GripVertical className="size-4" />
						</TooltipTrigger>
						<TooltipContent>Drag to reorder</TooltipContent>
					</Tooltip>
					{index + 1}
				</div>

				<Input
					value={signer.label}
					onChange={(e) =>
						onChange({ label: e.target.value })
					}
					placeholder={creator ? 'Your name' : 'Name'}
					aria-label={`Signer ${index + 1} name`}
					aria-invalid={check.labelTooLong || undefined}
					autoFocus={autoFocus}
					className={cn(
						field,
						'min-w-0 flex-1 px-3 aria-invalid:border-error-foreground aria-invalid:ring-0 @xl/card:w-25 @xl/card:flex-none',
					)}
					data-testid="create-signer-label"
				/>

				<KeyField
					signer={signer}
					status={status}
					index={index}
					onChange={(key) => onChange({ key })}
				/>

				{/* In a narrow card the weight and remove controls take a
				    third line of their own, under a "Weight" label. */}
				<div className="order-last flex w-full items-center gap-2.5 @xl/card:contents">
					<span className="mr-auto text-12 text-muted-foreground @xl/card:hidden">
						Weight
					</span>
					<NumberStepper
						value={signer.weight}
						min={1}
						max={CONFIG.MAX_WEIGHT}
						onChange={(weight) => onChange({ weight })}
						label="Weight"
						size="sm"
						testId="create-signer-weight"
					/>

					{creator ? (
						<span
							aria-hidden
							className="size-4.5 shrink-0"
						/>
					) : (
						<Tooltip>
							<TooltipTrigger
								aria-label={`Remove signer ${index + 1}`}
								onClick={onRemove}
								className="flex size-4.5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
								data-testid="create-signer-remove"
							>
								<Trash2 className="size-3.5" />
							</TooltipTrigger>
							<TooltipContent>Remove signer</TooltipContent>
						</Tooltip>
					)}
				</div>
			</div>

			<StatusLine
				creator={creator}
				status={status}
				check={check}
			/>
		</div>
	);
}

function KeyField({
	signer,
	status,
	index,
	onChange,
}: {
	signer: SignerDraft;
	status: SignerCheck['status'];
	index: number;
	onChange: (key: string) => void;
}) {
	const creator = !!signer.isCreator;
	return (
		<div
			className={cn(
				'order-last flex h-9.5 w-full min-w-0 items-center gap-1.5 rounded-md border border-foreground/12 bg-card py-1 pr-1 pl-3 focus-within:border-foreground @xl/card:order-none @xl/card:w-auto @xl/card:flex-1',
				status.kind === 'error' &&
					'border-error-foreground focus-within:border-error-foreground',
				status.kind === 'no-key' &&
					'border-warning-border focus-within:border-warning-foreground',
				creator && 'border-foreground/10 bg-muted',
			)}
		>
			<input
				value={signer.key}
				readOnly={creator}
				onChange={(e) => onChange(e.target.value)}
				placeholder="Paste a public key, or search by address"
				aria-label={`Signer ${index + 1} public key or address`}
				spellCheck={false}
				autoComplete="off"
				className={cn(
					'h-full min-w-0 flex-1 truncate bg-transparent font-mono text-12 outline-none placeholder:font-sans placeholder:text-muted-foreground/70',
					creator && 'text-muted-foreground',
				)}
				data-testid="create-signer-key"
			/>
			{creator ? (
				<span aria-hidden className="size-7 shrink-0" />
			) : signer.key ? (
				<Tooltip>
					<TooltipTrigger
						aria-label="Clear"
						onClick={() => onChange('')}
						className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
						data-testid="create-signer-key-clear"
					>
						<X className="size-3.5" />
					</TooltipTrigger>
					<TooltipContent>Clear</TooltipContent>
				</Tooltip>
			) : (
				<span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
					<Search aria-hidden className="size-3.5" />
				</span>
			)}
		</div>
	);
}

function StatusLine({
	creator,
	status,
	check,
}: {
	creator: boolean;
	status: SignerCheck['status'];
	check: SignerCheck;
}) {
	const label =
		check.labelLength >= LABEL_NEAR ? (
			<p
				className={cn(
					'text-12',
					check.labelTooLong
						? 'text-error-foreground'
						: 'text-muted-foreground',
				)}
				data-testid="create-signer-label-hint"
			>
				Name: {check.labelLength} of {LABEL_MAX} characters
				{check.labelTooLong &&
					`. Use ${LABEL_MAX} or fewer.`}
			</p>
		) : null;

	let line = null;
	if (status.kind === 'valid')
		line = (
			<p className="flex min-w-0 items-center gap-1.5 text-12">
				<Check className="size-3 shrink-0 text-success-foreground" />
				<span className="text-success-foreground">
					{creator
						? 'Your connected wallet'
						: 'Valid public key'}
				</span>
				<span
					aria-hidden
					className="text-muted-foreground/70"
				>
					·
				</span>
				<ShortAddress
					address={status.address}
					className="font-mono text-11 text-muted-foreground"
				/>
			</p>
		);
	else if (status.kind === 'looking-up')
		line = (
			<p className="text-12 text-muted-foreground">
				Looking up the public key…
			</p>
		);
	else if (
		status.kind === 'no-key' ||
		status.kind === 'error'
	)
		line = (
			<p
				className={cn(
					'flex items-start gap-1.5 text-12 leading-normal',
					status.kind === 'error'
						? 'text-error-foreground'
						: 'text-warning-foreground',
				)}
			>
				<AlertTriangle className="mt-0.5 size-3 shrink-0" />
				{status.message}
			</p>
		);

	if (!line && !label) return null;
	return (
		<div
			className="flex flex-col gap-0.5 pl-6.5"
			data-testid="create-signer-status"
		>
			{line}
			{label}
		</div>
	);
}
