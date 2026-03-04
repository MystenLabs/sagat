// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { toBase64 } from '@mysten/sui/utils';
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
		// TODO: SuiClientTypes.Event only exposes `bcs`, but the gRPC proto has a `json` field (field 6)
		// that the server populates. The SDK mapping layer (grpc/core.ts) drops it.
		// Once the SDK adds `json` to SuiClientTypes.Event, switch back to showing parsed JSON.
		Data: event.bcs ? (
			<Textarea
				value={toBase64(event.bcs)}
				rows={4}
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
