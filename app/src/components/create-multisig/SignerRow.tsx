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
import { useRef } from 'react';

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { Input } from '@/components/ui/input';
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from '@/components/ui/input-group';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { CONFIG } from '@/lib/constants';
import {
	COPY,
	type SignerCheck,
	type SignerDraft,
	type SignerStatus,
} from '@/lib/create-multisig';
import { cn } from '@/lib/utils';

import { NumberStepper } from './parts';

const LABEL_MAX = CONFIG.MAX_KEY_LABEL_LENGTH;
// The label counter shows from here on.
const LABEL_NEAR = LABEL_MAX - 8;

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
	const statusId = `${signer.id}-status`;

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
			}}
			className={cn(
				'relative flex flex-col rounded-lg border bg-muted/50 px-3 py-2.5 focus-within:border-foreground/55',
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
					aria-invalid={
						check.labelTooLong ||
						check.labelInvalid ||
						undefined
					}
					autoFocus={autoFocus}
					size="sm"
					className="min-w-0 flex-1 @xl/card:w-25 @xl/card:flex-none"
					data-testid="create-signer-label"
				/>

				<KeyField
					signer={signer}
					status={status}
					index={index}
					describedBy={statusId}
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
						label={`Signer ${index + 1} weight`}
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
				id={statusId}
				creator={creator}
				check={check}
			/>
		</div>
	);
}

function KeyField({
	signer,
	status,
	index,
	describedBy,
	onChange,
}: {
	signer: SignerDraft;
	status: SignerStatus;
	index: number;
	/** The status line's id. */
	describedBy: string;
	onChange: (key: string) => void;
}) {
	const creator = !!signer.isCreator;
	const input = useRef<HTMLInputElement>(null);
	return (
		<InputGroup
			size="sm"
			tone={
				status.kind === 'no-key' ? 'warning' : undefined
			}
			className={cn(
				'order-last w-full @xl/card:order-none @xl/card:w-auto @xl/card:flex-1',
				creator && 'bg-muted',
			)}
		>
			<InputGroupInput
				ref={input}
				value={signer.key}
				readOnly={creator}
				onChange={(e) => onChange(e.target.value)}
				placeholder="Paste a public key, or search by address"
				aria-label={`Signer ${index + 1} public key or address`}
				aria-invalid={
					status.kind === 'error' ||
					status.kind === 'no-key'
						? true
						: undefined
				}
				aria-describedby={describedBy}
				spellCheck={false}
				autoComplete="off"
				className={cn(
					'truncate font-mono placeholder:font-sans md:text-12',
					creator && 'text-muted-foreground',
				)}
				data-testid="create-signer-key"
			/>
			<InputGroupAddon align="inline-end">
				{creator ? (
					<span aria-hidden className="size-7 shrink-0" />
				) : signer.key ? (
					<Tooltip>
						<TooltipTrigger
							aria-label="Clear"
							onClick={() => {
								onChange('');
								// The button goes with the key, so focus stays in the row.
								input.current?.focus();
							}}
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
			</InputGroupAddon>
		</InputGroup>
	);
}

function StatusLine({
	id,
	creator,
	check,
}: {
	id: string;
	creator: boolean;
	check: SignerCheck;
}) {
	const { status } = check;
	const label = check.labelInvalid ? (
		<p
			className="text-12 text-error-foreground"
			data-testid="create-signer-label-hint"
		>
			{COPY.labelInvalid}
		</p>
	) : check.labelLength >= LABEL_NEAR ? (
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
			{check.labelTooLong && `. Use ${LABEL_MAX} or fewer.`}
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

	// Always rendered, empty when there is nothing to say, so the key
	// field can point at it and changes are announced.
	return (
		<div id={id} aria-live="polite">
			{(line || label) && (
				<div
					className="mt-1.5 flex flex-col gap-0.5 pl-6.5"
					data-testid="create-signer-status"
				>
					{line}
					{label}
				</div>
			)}
		</div>
	);
}
