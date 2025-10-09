// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type SuiObjectChange } from '@mysten/sui/client';

import { Label } from '@/components/ui/label';

import { ObjectLink } from '../ObjectLink';
import { PreviewCard } from '../PreviewCard';

const objectTypes: Record<
	string,
	{
		title: string;
		variant?:
			| 'success'
			| 'warning'
			| 'error'
			| 'info'
			| 'neutral'
			| 'purple';
	}
> = {
	published: {
		title: 'Published',
		variant: 'success',
	},
	created: {
		title: 'Created',
		variant: 'success',
	},
	wrapped: {
		title: 'Wrapped',
		variant: 'neutral',
	},
	mutated: {
		title: 'Mutated',
		variant: 'warning',
	},
	deleted: {
		title: 'Deleted',
		variant: 'error',
	},
	transferred: {
		title: 'Transferred',
		variant: 'info',
	},
};

// SPDX-License-Identifier: Apache-2.0
export function ObjectChanges({
	objects,
}: {
	objects: SuiObjectChange[];
}) {
	return (
		<div className="grid grid-cols-1 gap-5">
			{objects.map((object, index) => (
				<ChangedObject key={index} object={object} />
			))}
		</div>
	);
}

function ChangedObject({
	object,
}: {
	object: SuiObjectChange;
}) {
	const objectType = objectTypes[object.type];

	return (
		<PreviewCard.Root>
			<PreviewCard.Body>
				<>
					<Label
						variant={objectType?.variant}
						size="sm"
						className="rounded"
					>
						{objectType?.title}
					</Label>
					<div className="flex gap-3 items-center break-words my-2">
						Type:{' '}
						<ObjectLink
							type={
								'objectType' in object
									? object.objectType
									: ''
							}
							className="break-words"
						/>
					</div>

					<label className="flex gap-3 items-center flex-wrap break-words">
						Object ID: <ObjectLink object={object} />
					</label>
				</>
			</PreviewCard.Body>

			<PreviewCard.Footer
				owner={'owner' in object ? object.owner : undefined}
			/>
		</PreviewCard.Root>
	);
}
