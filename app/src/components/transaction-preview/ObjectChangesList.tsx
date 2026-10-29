// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { useMemo, useState } from 'react';

import { Chip, type ChipProps } from '@/components/ui/chip';
import { prettifyType } from '@/lib/coin-type';
import { cn } from '@/lib/utils';

import { ObjectLink } from './ObjectLink';
import { EmptyPanel, Field } from './parts';

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
		return { title: 'Published', variant: 'success' };
	}
	if (idOperation === 'Created') {
		return { title: 'Created', variant: 'success' };
	}
	if (idOperation === 'Deleted') {
		return { title: 'Deleted', variant: 'error' };
	}
	if (
		inputState === 'Exists' &&
		outputState === 'DoesNotExist'
	) {
		return { title: 'Wrapped', variant: 'neutral' };
	}
	if (
		inputState === 'Exists' &&
		outputState === 'ObjectWrite' &&
		inputOwner &&
		outputOwner &&
		JSON.stringify(inputOwner) !==
			JSON.stringify(outputOwner)
	) {
		return { title: 'Transferred', variant: 'info' };
	}
	return { title: 'Mutated', variant: 'warning' };
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

	const [activeFilter, setActiveFilter] = useState('All');

	if (objects.length === 0) {
		return <EmptyPanel>No object changes.</EmptyPanel>;
	}

	const filtered =
		activeFilter === 'All'
			? annotated
			: annotated.filter(
					({ kind }) => kind.title === activeFilter,
				);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap gap-1.5">
				<FilterPill
					label="All"
					count={objects.length}
					variant="neutral"
					active={activeFilter === 'All'}
					onClick={() => setActiveFilter('All')}
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
							<Field label="Type">
								<span className="min-w-0 font-mono text-12 break-all">
									{prettifyType(type)}
								</span>
							</Field>
						)}
						<Field label="Object ID">
							<span className="flex min-w-0 items-center font-mono text-12 break-all">
								<ObjectLink object={object} />
							</span>
						</Field>
						{object.outputOwner && (
							<Field label="Owner">
								<span className="flex min-w-0 items-center font-mono text-12 break-all">
									<ObjectLink
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
