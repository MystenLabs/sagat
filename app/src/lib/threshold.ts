// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * "4 of 7": the approval threshold against the signers' total weight, the
 * one way the app writes it. Never against the number of signers.
 */
export function thresholdLabel({
	threshold,
	totalWeight,
}: {
	threshold: number;
	totalWeight: number;
}) {
	return `${threshold} of ${totalWeight}`;
}

/** Bars draw one segment per unit of weight up to this many units. */
export const BAR_SEGMENT_CAP = 10;
