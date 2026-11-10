// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export type SessionChange = 'signed-in' | 'signed-out';

// A channel never receives its own messages, so one serves both ends.
const channel =
	typeof BroadcastChannel === 'undefined'
		? null
		: new BroadcastChannel('session');

export function announceSessionChange(
	change: SessionChange,
) {
	channel?.postMessage(change);
}

export function onSessionChange(
	listener: (change: SessionChange) => void,
): () => void {
	if (!channel) return () => {};
	const handle = (event: MessageEvent<SessionChange>) =>
		listener(event.data);
	channel.addEventListener('message', handle);
	return () =>
		channel.removeEventListener('message', handle);
}
