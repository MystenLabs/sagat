// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { useMemo, useState } from 'react';

import { Label, type LabelProps } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { ObjectLink } from '../ObjectLink';
import { PreviewCard } from '../PreviewCard';
import { prettifyType } from '../utils';

type ChangeKind = {
	title: string;
	variant: NonNullable<LabelProps['variant']>;
};

function deriveChangeKind(
	object: SuiClientTypes.ChangedObject,
): ChangeKind {
	const { inputState, outputState, idOperation, inputOwner, outputOwner } = object;

	if (idOperation === 'Created' && outputState === 'PackageWrite') {
		return { title: 'Published', variant: 'success' };
	}
	if (idOperation === 'Created') {
		return { title: 'Created', variant: 'success' };
	}
	if (idOperation === 'Deleted') {
		return { title: 'Deleted', variant: 'error' };
	}
	if (inputState === 'Exists' && outputState === 'DoesNotExist') {
		return { title: 'Wrapped', variant: 'neutral' };
	}
	if (
		inputState === 'Exists' &&
		outputState === 'ObjectWrite' &&
		inputOwner && outputOwner &&
		JSON.stringify(inputOwner) !== JSON.stringify(outputOwner)
	) {
		return { title: 'Transferred', variant: 'info' };
	}
	return { title: 'Mutated', variant: 'warning' };
}

type AnnotatedObject = {
	object: SuiClientTypes.ChangedObject;
	kind: ChangeKind;
};

type KindGroup = {
	variant: NonNullable<LabelProps['variant']>;
	count: number;
};

function FilterPill({
	label,
	count,
	variant,
	active,
	onClick,
}: {
	label: string;
	count: number;
	variant: NonNullable<LabelProps['variant']>;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button type="button" onClick={onClick} className="cursor-pointer">
			<Label
				variant={variant}
				size="sm"
				className={cn(
					'rounded cursor-pointer',
					active && 'ring-2 ring-offset-1 ring-current',
				)}
			>
				{label} ({count})
			</Label>
		</button>
	);
}

export function ObjectChanges({
	objects,
	objectTypes,
}: {
	objects: SuiClientTypes.ChangedObject[];
	objectTypes?: Record<string, string>;
}) {
	const { annotated, groups } = useMemo(() => {
		const annotated: AnnotatedObject[] = [];
		const groups = new Map<string, KindGroup>();

		for (const object of objects) {
			const kind = deriveChangeKind(object);
			annotated.push({ object, kind });

			const existing = groups.get(kind.title);
			if (existing) {
				existing.count++;
			} else {
				groups.set(kind.title, { variant: kind.variant, count: 1 });
			}
		}

		return { annotated, groups };
	}, [objects]);

	const [activeFilter, setActiveFilter] = useState('All');

	const filtered =
		activeFilter === 'All'
			? annotated
			: annotated.filter((a) => a.kind.title === activeFilter);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap gap-2">
				<FilterPill
					label="All"
					count={objects.length}
					variant="neutral"
					active={activeFilter === 'All'}
					onClick={() => setActiveFilter('All')}
				/>
				{[...groups.entries()].map(([kind, group]) => (
					<FilterPill
						key={kind}
						label={kind}
						count={group.count}
						variant={group.variant}
						active={activeFilter === kind}
						onClick={() => setActiveFilter(kind)}
					/>
				))}
			</div>

			<div className="grid grid-cols-1 gap-5">
				{filtered.map(({ object, kind }, i) => (
					<ChangedObject
						key={object.objectId ?? i}
						object={object}
						kind={kind}
						objectType={objectTypes?.[object.objectId]}
					/>
				))}
			</div>
		</div>
	);
}

function ChangedObject({
	object,
	kind,
	objectType,
}: {
	object: SuiClientTypes.ChangedObject;
	kind: ChangeKind;
	objectType?: string;
}) {
	return (
		<PreviewCard.Root>
			<PreviewCard.Body>
				<Label variant={kind.variant} size="sm" className="rounded">
					{kind.title}
				</Label>

				{objectType && (
					<div className="flex gap-3 items-center wrap-break-word my-2">
						Type:{' '}
						<ObjectLink
							type={prettifyType(objectType)}
							className="wrap-break-word"
						/>
					</div>
				)}

				<label className="flex gap-3 items-center flex-wrap wrap-break-word my-2">
					Object ID: <ObjectLink object={object} />
				</label>
			</PreviewCard.Body>

			<PreviewCard.Footer owner={object.outputOwner ?? undefined} />
		</PreviewCard.Root>
	);
}
