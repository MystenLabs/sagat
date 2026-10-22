// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

function parse(value: Date | string | null) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** "Sep 2, 2026, 10:42 AM" in the viewer's locale, or null when unknown. */
export function formatDateTime(
	value: Date | string | null,
) {
	return (
		parse(value)?.toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}) ?? null
	);
}

/** "Sep 4, 2026" in the viewer's locale, or null when unknown. */
export function formatDate(value: Date | string | null) {
	return (
		parse(value)?.toLocaleDateString(undefined, {
			dateStyle: 'medium',
		}) ?? null
	);
}
