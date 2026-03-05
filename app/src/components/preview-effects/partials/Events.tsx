// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { type ReactNode } from 'react';

import { Textarea } from '@/components/ui/textarea';

import { ObjectLink } from '../ObjectLink';
import { PreviewCard } from '../PreviewCard';

export function Events({
	events,
}: {
	events: SuiClientTypes.Event[];
}) {
	if (events.length === 0) {
		return <div>No events were emitted.</div>;
	}

	return (
		<div>
			{events.map((event, index) => (
				<Event key={index} event={event} />
			))}
		</div>
	);
}

export function Event({
	event,
}: {
	event: SuiClientTypes.Event;
}) {
	const fields: Record<string, ReactNode> = {
		'Package ID': (
			<ObjectLink inputObject={event.packageId} />
		),
		Module: <span>{event.module}</span>,
		Sender: (
			<ObjectLink
				owner={{
					$kind: 'AddressOwner',
					AddressOwner: event.sender,
				}}
			/>
		),
		Data: event.json ? (
			<Textarea
				value={JSON.stringify(event.json, null, 2)}
				rows={6}
				readOnly
				className="font-mono text-xs"
			/>
		) : (
			'-'
		),
	};

	return (
		<PreviewCard.Root>
			<PreviewCard.Header>
				<p>
					Event Type: <strong>{event.eventType}</strong>
				</p>
			</PreviewCard.Header>
			<PreviewCard.Body>
				{Object.entries(fields).map(([key, value]) => (
					<div
						key={key}
						className="flex items-center gap-3 mb-3 "
					>
						<p className="capitalize min-w-[100px]">
							{key}:{' '}
						</p>
						{value}
					</div>
				))}
			</PreviewCard.Body>
		</PreviewCard.Root>
	);
}
