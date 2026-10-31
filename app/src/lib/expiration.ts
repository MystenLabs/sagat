// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';

import { content } from '../content';

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

// How long until `time` in its largest whole unit, e.g. "2 days", "5 hours"
// or "12 minutes".
export function formatTimeLeft(time: Date, now: Date) {
	const minutes = Math.floor(
		(time.getTime() - now.getTime()) / 60_000,
	);
	const copy = content.proposals.timeLeft;
	if (minutes < 1) return copy.underAMinute;

	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	if (days > 0) return copy.days(days);
	if (hours > 0) return copy.hours(hours);
	return copy.minutes(minutes);
}

// Under this much time left, an expiry is called out.
const EXPIRES_SOON_MS = 60 * 60_000;

// Whether `endsAt` is less than an hour after `now`. One that has already
// passed counts too; callers show "Expired" for those first.
export function expiresSoon(endsAt: Date, now: Date) {
	return endsAt.getTime() - now.getTime() < EXPIRES_SOON_MS;
}
