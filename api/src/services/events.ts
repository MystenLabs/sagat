// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The single recording function for state changes (docs/account-rotation.md,
 * "Room left for later"). Today it only updates metrics. It is the seam where
 * an event outbox can later also write a row.
 */

import {
	accountRotationEvents,
	MultisigEventType,
	multisigProposalEvents,
} from '../metrics';
import { type SuiNetwork } from '../utils/client';

/** Label used for events that are not tied to one network (signer sets are network-agnostic). */
export const ALL_NETWORKS = 'all';

export type ProposalEvent = {
	type: MultisigEventType;
	network: SuiNetwork;
	proposalId?: number;
};

export type RotationEvent =
	| {
			type: 'alias_refreshed';
			network: SuiNetwork;
			accountAddress: string;
			version: string | null;
	  }
	| {
			type: 'alias_added' | 'alias_removed';
			network: SuiNetwork;
			accountAddress: string;
			aliasAddress: string;
	  }
	| {
			type: 'signer_set_drafted' | 'signer_set_verified';
			accountAddress: string;
			signerSetAddress: string;
			/** Signer sets are network-agnostic; omitted means all networks. */
			network?: SuiNetwork;
	  };

export type RecordedEvent = ProposalEvent | RotationEvent;

const PROPOSAL_EVENT_TYPES = new Set<string>(
	Object.values(MultisigEventType),
);

const isProposalEvent = (
	event: RecordedEvent,
): event is ProposalEvent =>
	PROPOSAL_EVENT_TYPES.has(event.type);

export function recordEvent(event: RecordedEvent): void {
	if (isProposalEvent(event)) {
		multisigProposalEvents.inc({
			network: event.network,
			event_type: event.type,
		});
		return;
	}

	accountRotationEvents.inc({
		network: event.network ?? ALL_NETWORKS,
		event_type: event.type,
	});
}
