// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core';
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ArrowLeft, Info, Plus } from 'lucide-react';

import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { CONFIG } from '@/lib/constants';
import {
	COPY,
	thresholdBar,
	type SignerDraft,
	type SignersCheck,
} from '@/lib/create-multisig';
import { cn } from '@/lib/utils';

import {
	Divider,
	Notice,
	NumberStepper,
	SectionHeading,
	StepFooter,
} from './parts';
import { SignerRow } from './SignerRow';

/** Step 2: who signs, with what weight, and how much it takes. */
export function SignersStep({
	signers,
	check,
	threshold,
	maxThreshold,
	focusId,
	onSignersChange,
	onAddSigner,
	onThresholdChange,
	onBack,
	onContinue,
	onCancel,
}: {
	signers: SignerDraft[];
	check: SignersCheck;
	threshold: number;
	/** Every row's weight, complete or not. */
	maxThreshold: number;
	/** A row just added, whose name field takes focus. */
	focusId: string | null;
	onSignersChange: (signers: SignerDraft[]) => void;
	onAddSigner: () => void;
	onThresholdChange: (threshold: number) => void;
	onBack: () => void;
	onContinue: () => void;
	onCancel: () => void;
}) {
	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);
	const atMax = signers.length >= CONFIG.MAX_MEMBERS;

	const handleDragEnd = ({
		active,
		over,
	}: DragEndEvent) => {
		if (!over || active.id === over.id) return;
		const from = signers.findIndex(
			(s) => s.id === active.id,
		);
		const to = signers.findIndex((s) => s.id === over.id);
		onSignersChange(arrayMove(signers, from, to));
	};

	const addSigner = (
		<Button
			type="button"
			variant="outline"
			className={cn('h-9.5', atMax && disabledButton)}
			disabled={atMax}
			onClick={onAddSigner}
			data-testid="create-add-signer"
		>
			<Plus />
			Add signer
		</Button>
	);

	return (
		<div
			className="flex flex-col gap-7 p-5 md:p-7"
			data-testid="create-signers-step"
		>
			<section className="flex flex-col gap-3.5">
				<div className="flex items-start justify-between gap-4">
					<SectionHeading
						title="Signers"
						description="Paste each signer’s public key, or search by their address."
					/>
					<span
						className="shrink-0 text-12 text-muted-foreground"
						data-testid="create-signer-count"
					>
						{signers.length} of {CONFIG.MAX_MEMBERS}
					</span>
				</div>

				<div className="flex flex-col gap-2">
					<div
						aria-hidden
						className="hidden rounded-md bg-muted py-1.75 text-12 text-muted-foreground @xl/card:flex"
					>
						<span className="w-15 pl-4.25">#</span>
						<span className="w-25">Signer</span>
						<span className="flex-1 px-3">Public key</span>
						<span className="w-33.75">Weight</span>
					</div>
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
					>
						<SortableContext
							items={signers.map((s) => s.id)}
							strategy={verticalListSortingStrategy}
						>
							{signers.map((signer, index) => (
								<SignerRow
									key={signer.id}
									signer={signer}
									check={check.signers[index]}
									index={index}
									autoFocus={signer.id === focusId}
									onChange={(changes) =>
										onSignersChange(
											signers.map((s) =>
												s.id === signer.id
													? { ...s, ...changes }
													: s,
											),
										)
									}
									onRemove={() =>
										onSignersChange(
											signers.filter(
												(s) => s.id !== signer.id,
											),
										)
									}
								/>
							))}
						</SortableContext>
					</DndContext>
				</div>

				<div className="flex flex-col items-start gap-3 @xl/card:flex-row @xl/card:items-center @xl/card:justify-between">
					{atMax ? (
						<Tooltip>
							<TooltipTrigger
								render={<span className="inline-flex" />}
							>
								{addSigner}
							</TooltipTrigger>
							<TooltipContent>
								Up to {CONFIG.MAX_MEMBERS} signers
							</TooltipContent>
						</Tooltip>
					) : (
						addSigner
					)}
					{signers.length > 1 && (
						<p className="flex items-start gap-1.5 text-12 text-muted-foreground">
							<Info className="mt-0.5 size-3 shrink-0" />
							Signer order affects the address. Drag to
							reorder before you create the multisig.
						</p>
					)}
				</div>
			</section>

			<Divider />

			<section className="flex flex-col gap-3.5">
				<SectionHeading
					title="Approval threshold"
					description="How much signer weight a proposal needs before it can be executed."
				/>
				<div className="flex items-center gap-4">
					<NumberStepper
						value={threshold}
						min={1}
						max={maxThreshold}
						onChange={onThresholdChange}
						label="Threshold"
						size="lg"
						testId="create-threshold"
					/>
					<span
						className="text-16 text-foreground-secondary"
						data-testid="create-total-weight"
					>
						of {check.totalWeight} total weight
					</span>
				</div>
				<div className="flex flex-col gap-1.5">
					<ThresholdBar
						threshold={threshold}
						totalWeight={check.totalWeight}
					/>
					{check.tooFewSigners ? (
						<Notice
							tone="warning"
							className="mt-2"
							testId="create-too-few"
						>
							{COPY.tooFewSigners}
						</Notice>
					) : (
						check.warning && (
							<Notice
								tone="warning"
								className="mt-2"
								testId="create-threshold-warning"
							>
								{check.warning}
							</Notice>
						)
					)}
				</div>
			</section>

			<Divider />

			<StepFooter
				onCancel={onCancel}
				back={
					<Button
						type="button"
						variant="ghost"
						onClick={onBack}
						data-testid="create-back"
					>
						<ArrowLeft />
						Back
					</Button>
				}
				note={check.blockedMessage}
				noteTestId="create-blocked-reason"
				primary={
					<Button
						type="button"
						disabled={!check.canContinue}
						onClick={onContinue}
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
		</div>
	);
}

function ThresholdBar({
	threshold,
	totalWeight,
}: {
	threshold: number;
	totalWeight: number;
}) {
	const bar = thresholdBar(threshold, totalWeight);
	return (
		// The threshold field and "of N total weight" already say this.
		<div aria-hidden className="flex h-1.5 gap-1">
			{bar.kind === 'segments' ? (
				bar.filled.map((filled, i) => (
					<span
						key={i}
						className={cn(
							'flex-1 rounded-xs',
							filled ? 'bg-foreground' : 'bg-secondary',
						)}
					/>
				))
			) : (
				<>
					<span
						className="rounded-xs bg-foreground"
						style={{ width: `${bar.percent}%` }}
					/>
					{bar.percent < 100 && (
						<span className="flex-1 rounded-xs bg-secondary" />
					)}
				</>
			)}
		</div>
	);
}
