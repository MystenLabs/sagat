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
import { useRef, type ReactNode } from 'react';

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
import { content } from '@/content';
import { CONFIG } from '@/lib/constants';
import {
	type SignerCheck,
	type SignerDraft,
	type SignerStatus,
} from '@/lib/create-multisig';
import { cn } from '@/lib/utils';

import { NumberStepper } from './parts';

const COPY = content.createMultisig;

const LABEL_MAX = CONFIG.MAX_KEY_LABEL_LENGTH;
// The label counter shows from here on.
const LABEL_NEAR = LABEL_MAX - 8;

/**
 * One signer: drag handle, name, key, weight and remove. The creator's
 * key is their wallet's and read-only; their name is theirs to edit.
 * The optional props are Change signers' (removed rows, chips, notes).
 */
export function SignerRow({
	signer,
	check,
	index,
	autoFocus,
	focusKey = false,
	nameReadOnly = false,
	removed = false,
	onUndo,
	chip,
	note,
	onChange,
	onRemove,
}: {
	signer: SignerDraft;
	check: SignerCheck;
	index: number;
	autoFocus: boolean;
	focusKey?: boolean;
	nameReadOnly?: boolean;
	removed?: boolean;
	/** Undo for a removed row; disabled when unset. */
	onUndo?: () => void;
	chip?: ReactNode;
	note?: ReactNode;
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
	const faded = removed && 'pointer-events-none opacity-40';

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
			data-removed={removed || undefined}
		>
			<div className="flex flex-wrap items-center gap-2.5 @xl/card:flex-nowrap">
				<div
					className={cn(
						'flex w-9 shrink-0 items-center gap-1.5 text-12 text-muted-foreground',
						faded,
					)}
				>
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
							aria-label={COPY.signerRow.dragLabel(
								index + 1,
							)}
							className="-ml-1 flex cursor-grab touch-none items-center rounded-sm p-0.5 text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
							data-testid="create-signer-drag"
						>
							<GripVertical className="size-4" />
						</TooltipTrigger>
						<TooltipContent>
							{COPY.signerRow.drag}
						</TooltipContent>
					</Tooltip>
					{index + 1}
				</div>

				{/* The column sizing sits on a wrapper so the input's padding
				    does not count towards its share of the row. */}
				<div
					className={cn(
						'min-w-0 flex-1 @xl/card:min-w-25',
						faded,
					)}
				>
					<Input
						value={signer.label}
						readOnly={nameReadOnly || removed}
						className={cn(
							(nameReadOnly || removed) &&
								'bg-muted text-muted-foreground',
						)}
						onChange={(e) =>
							onChange({ label: e.target.value })
						}
						placeholder={
							creator
								? COPY.signerRow.yourNamePlaceholder
								: COPY.signerRow.namePlaceholder
						}
						aria-label={COPY.signerRow.nameLabel(index + 1)}
						aria-invalid={
							check.labelTooLong ||
							check.labelInvalid ||
							undefined
						}
						autoFocus={autoFocus}
						size="sm"
						data-testid="create-signer-label"
					/>
				</div>

				<KeyField
					signer={signer}
					status={status}
					index={index}
					describedBy={statusId}
					autoFocus={focusKey}
					readOnly={removed}
					className={faded || undefined}
					onChange={(key) => onChange({ key })}
				/>

				{/* In a narrow card the weight and remove controls take a
				    third line of their own, under a "Weight" label. */}
				<div className="order-last flex w-full items-center gap-2.5 @xl/card:contents">
					<span className="mr-auto text-12 text-muted-foreground @xl/card:hidden">
						{content.common.fields.weight}
					</span>
					<NumberStepper
						value={signer.weight}
						min={1}
						max={CONFIG.MAX_WEIGHT}
						onChange={(weight) => onChange({ weight })}
						label={COPY.signerRow.weightLabel(index + 1)}
						size="sm"
						testId="create-signer-weight"
						className={faded || undefined}
					/>

					{removed ? (
						<button
							type="button"
							onClick={onUndo}
							disabled={!onUndo}
							className="shrink-0 cursor-pointer rounded-sm text-12 text-foreground-secondary outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40"
							data-testid="signer-undo"
						>
							{content.changeSigners.row.undo}
						</button>
					) : creator ? (
						<span
							aria-hidden
							className="size-4.5 shrink-0"
						/>
					) : (
						<Tooltip>
							<TooltipTrigger
								aria-label={COPY.signerRow.removeLabel(
									index + 1,
								)}
								onClick={onRemove}
								className="flex size-4.5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
								data-testid="create-signer-remove"
							>
								<Trash2 className="size-3.5" />
							</TooltipTrigger>
							<TooltipContent>
								{COPY.signerRow.remove}
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			</div>

			<StatusLine
				id={statusId}
				creator={creator}
				check={check}
				chip={chip}
				note={note}
			/>
		</div>
	);
}

function KeyField({
	signer,
	status,
	index,
	describedBy,
	autoFocus,
	readOnly,
	className,
	onChange,
}: {
	signer: SignerDraft;
	status: SignerStatus;
	index: number;
	/** The status line's id. */
	describedBy: string;
	autoFocus: boolean;
	readOnly: boolean;
	className?: string;
	onChange: (key: string) => void;
}) {
	const creator = !!signer.isCreator || readOnly;
	const input = useRef<HTMLInputElement>(null);
	return (
		<InputGroup
			size="sm"
			tone={
				status.kind === 'no-key' ? 'warning' : undefined
			}
			className={cn(
				'order-last w-full @xl/card:order-none @xl/card:w-auto @xl/card:flex-2',
				creator && 'bg-muted',
				className,
			)}
		>
			<InputGroupInput
				ref={input}
				value={signer.key}
				readOnly={creator}
				autoFocus={autoFocus}
				onChange={(e) => onChange(e.target.value)}
				placeholder={COPY.signerRow.keyPlaceholder}
				aria-label={COPY.signerRow.keyLabel(index + 1)}
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
							aria-label={COPY.signerRow.clear}
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
						<TooltipContent>
							{COPY.signerRow.clear}
						</TooltipContent>
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
	chip,
	note,
}: {
	id: string;
	creator: boolean;
	check: SignerCheck;
	chip?: ReactNode;
	note?: ReactNode;
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
			{COPY.signerRow.labelCount(
				check.labelLength,
				LABEL_MAX,
			)}
		</p>
	) : null;

	let line = null;
	if (status.kind === 'valid')
		line = (
			<p
				className={cn(
					'flex min-w-0 items-center gap-1.5 text-12',
					note && 'flex-wrap',
				)}
			>
				<Check className="size-3 shrink-0 text-success-foreground" />
				<span className="text-success-foreground">
					{creator
						? COPY.signerRow.yourWallet
						: COPY.signerRow.validKey}
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
				{note && (
					<>
						<span
							aria-hidden
							className="text-muted-foreground/70"
						>
							·
						</span>
						{note}
					</>
				)}
			</p>
		);
	else if (status.kind === 'looking-up')
		line = (
			<p className="text-12 text-muted-foreground">
				{COPY.signerRow.lookingUp}
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

	// Without a status line, the note stands alone.
	const lone = !line && note;
	// Always rendered, empty when there is nothing to say, so the key
	// field can point at it and changes are announced.
	return (
		<div id={id} aria-live="polite">
			{(line || label || chip || lone) && (
				<div
					className="mt-1.5 flex flex-col gap-0.5 pl-6.5"
					data-testid="create-signer-status"
				>
					{chip || lone ? (
						<div className="flex flex-wrap items-center gap-2 text-12 text-muted-foreground">
							{chip}
							{line}
							{lone}
						</div>
					) : (
						line
					)}
					{label}
				</div>
			)}
		</div>
	);
}
