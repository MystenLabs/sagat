// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { useMemo, useState } from 'react';

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { Chip, type ChipProps } from '@/components/ui/chip';
import { content } from '@/content';
import { prettifyType } from '@/lib/coin-type';
import { cn } from '@/lib/utils';

import { OwnerAddress } from './OwnerAddress';
import { EmptyPanel, Field } from './parts';

const COPY = content.transactionPreview.objects;

type ChipVariant = NonNullable<ChipProps['variant']>;

type ChangeKind = {
	title: string;
	variant: ChipVariant;
};

function deriveChangeKind(
	object: SuiClientTypes.ChangedObject,
): ChangeKind {
	const {
		inputState,
		outputState,
		idOperation,
		inputOwner,
		outputOwner,
	} = object;

	if (
		idOperation === 'Created' &&
		outputState === 'PackageWrite'
	) {
		return {
			title: COPY.kinds.published,
			variant: 'success',
		};
	}
	if (idOperation === 'Created') {
		return {
			title: COPY.kinds.created,
			variant: 'success',
		};
	}
	if (idOperation === 'Deleted') {
		return {
			title: COPY.kinds.deleted,
			variant: 'error',
		};
	}
	if (
		inputState === 'Exists' &&
		outputState === 'DoesNotExist'
	) {
		return {
			title: COPY.kinds.wrapped,
			variant: 'neutral',
		};
	}
	if (
		inputState === 'Exists' &&
		outputState === 'ObjectWrite' &&
		inputOwner &&
		outputOwner &&
		JSON.stringify(inputOwner) !==
			JSON.stringify(outputOwner)
	) {
		return {
			title: COPY.kinds.transferred,
			variant: 'info',
		};
	}
	return {
		title: COPY.kinds.mutated,
		variant: 'warning',
	};
}

function FilterPill({
	label,
	count,
	variant,
	active,
	onClick,
}: {
	label: string;
	count: number;
	variant: ChipVariant;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<Chip
				variant={variant}
				size="md"
				className={cn(
					active && 'ring-1 ring-current ring-inset',
				)}
			>
				{label} ({count})
			</Chip>
		</button>
	);
}

/** Every object the transaction touches, filterable by kind of change. */
export function ObjectChangesList({
	objects,
	objectTypes,
	senderAddress,
}: {
	objects: SuiClientTypes.ChangedObject[];
	objectTypes: Record<string, string>;
	senderAddress?: string;
}) {
	const { annotated, groups } = useMemo(() => {
		const annotated = objects.map((object) => ({
			object,
			kind: deriveChangeKind(object),
		}));
		const groups = new Map<
			string,
			{ variant: ChipVariant; count: number }
		>();
		for (const { kind } of annotated) {
			const group = groups.get(kind.title);
			if (group) group.count++;
			else
				groups.set(kind.title, {
					variant: kind.variant,
					count: 1,
				});
		}
		return { annotated, groups };
	}, [objects]);

	const [activeFilter, setActiveFilter] = useState<string>(
		COPY.all,
	);

	if (objects.length === 0) {
		return <EmptyPanel>{COPY.empty}</EmptyPanel>;
	}

	const filtered =
		activeFilter === COPY.all
			? annotated
			: annotated.filter(
					({ kind }) => kind.title === activeFilter,
				);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap gap-1.5">
				<FilterPill
					label={COPY.all}
					count={objects.length}
					variant="neutral"
					active={activeFilter === COPY.all}
					onClick={() => setActiveFilter(COPY.all)}
				/>
				{[...groups.entries()].map(([title, group]) => (
					<FilterPill
						key={title}
						label={title}
						count={group.count}
						variant={group.variant}
						active={activeFilter === title}
						onClick={() => setActiveFilter(title)}
					/>
				))}
			</div>

			{filtered.map(({ object, kind }, i) => {
				const type = objectTypes[object.objectId];
				return (
					<div
						key={object.objectId ?? i}
						className="flex flex-col gap-2 rounded-lg border p-3 text-13"
						data-testid="object-change"
						data-kind={kind.title}
					>
						<div>
							<Chip variant={kind.variant} size="sm">
								{kind.title}
							</Chip>
						</div>
						{type && (
							<Field label={content.common.fields.type}>
								<span className="min-w-0 font-mono text-12 break-all">
									{prettifyType(type)}
								</span>
							</Field>
						)}
						<Field label={COPY.objectId}>
							<span className="flex min-w-0 items-center font-mono text-12 break-all">
								<ShortAddress address={object.objectId} />
							</span>
						</Field>
						{object.outputOwner && (
							<Field label={content.common.fields.owner}>
								<span className="flex min-w-0 items-center font-mono text-12 break-all">
									<OwnerAddress
										owner={object.outputOwner}
										senderAddress={senderAddress}
									/>
								</span>
							</Field>
						)}
					</div>
				);
			})}
		</div>
	);
}
