// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { Textarea } from '@/components/ui/textarea';
import { prettifyType } from '@/lib/coin-type';

import { OwnerAddress } from './OwnerAddress';
import { EmptyPanel, Field } from './parts';

/** The events the transaction emits: type, origin and data. */
export function EventsList({
	events,
	senderAddress,
}: {
	events: SuiClientTypes.Event[];
	senderAddress?: string;
}) {
	if (events.length === 0) {
		return <EmptyPanel>No events were emitted.</EmptyPanel>;
	}

	return (
		<div className="flex flex-col gap-3">
			{events.map((event, index) => (
				<div
					key={index}
					className="flex flex-col gap-2 rounded-lg border p-3 text-13"
					data-testid="transaction-preview-event"
				>
					<Field label="Type">
						<span className="min-w-0 font-mono text-12 font-medium break-all">
							{prettifyType(event.eventType)}
						</span>
					</Field>
					<Field label="Package">
						<span className="flex min-w-0 items-center font-mono text-12 break-all">
							<ShortAddress address={event.packageId} />
						</span>
					</Field>
					<Field label="Module">
						<span className="font-mono text-12">
							{event.module}
						</span>
					</Field>
					<Field label="Sender">
						<span className="flex min-w-0 items-center font-mono text-12 break-all">
							<OwnerAddress
								owner={{
									$kind: 'AddressOwner',
									AddressOwner: event.sender,
								}}
								senderAddress={senderAddress}
							/>
						</span>
					</Field>
					<Field label="Data">
						{event.json ? (
							<Textarea
								value={JSON.stringify(event.json, null, 2)}
								rows={6}
								readOnly
								aria-label="Event data"
								className="resize-y font-mono md:text-12"
							/>
						) : (
							<span className="text-muted-foreground">
								—
							</span>
						)}
					</Field>
				</div>
			))}
		</div>
	);
}
