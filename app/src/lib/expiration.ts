// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';

export type EpochInfo = {
	epoch: string;
	epochStartTimestampMs: string;
	epochDurationMs: string;
};

export type Expiry = {
	// The last epoch the transaction can execute in.
	lastEpoch: bigint;
	expired: boolean;
	// When `lastEpoch` is due to end. Epochs can run a little late.
	endsAt: Date;
};

// When a transaction stops being executable, or null if it never does.
export function getExpiry(
	transactionBytes: string,
	now: EpochInfo,
): Expiry | null {
	const lastEpoch = getLastEpoch(transactionBytes);
	if (lastEpoch === null) return null;

	const epochsLeft = lastEpoch - BigInt(now.epoch) + 1n;
	const endsAt = new Date(
		Number(now.epochStartTimestampMs) +
			Number(epochsLeft) * Number(now.epochDurationMs),
	);
	// Too far in the future to be a date, so as good as never.
	if (Number.isNaN(endsAt.getTime())) return null;

	return { lastEpoch, expired: epochsLeft <= 0n, endsAt };
}

function getLastEpoch(transactionBytes: string) {
	const { expiration } = Transaction.from(
		transactionBytes,
	).getData();
	switch (expiration?.$kind) {
		case 'Epoch':
			return BigInt(expiration.Epoch);
		case 'ValidDuring':
		case 'Validity': {
			const { maxEpoch } =
				expiration.ValidDuring ?? expiration.Validity;
			return maxEpoch == null ? null : BigInt(maxEpoch);
		}
		default:
			return null;
	}
}

// How long until `time`, e.g. "2d 3h", "5h 12m" or "12m".
export function formatTimeLeft(time: Date, now: Date) {
	const minutes = Math.floor(
		(time.getTime() - now.getTime()) / 60_000,
	);
	if (minutes < 1) return 'less than a minute';

	const days = Math.floor(minutes / (24 * 60));
	const hours = Math.floor(minutes / 60) % 24;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes % 60}m`;
	return `${minutes}m`;
}

// Under this much time left, an expiry is called out.
const EXPIRES_SOON_MS = 60 * 60_000;

// Whether `endsAt` is less than an hour after `now`. One that has already
// passed counts too; callers show "Expired" for those first.
export function expiresSoon(endsAt: Date, now: Date) {
	return endsAt.getTime() - now.getTime() < EXPIRES_SOON_MS;
}
