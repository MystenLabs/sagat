// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

function parse(value: Date | string | number | null) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** "Sep 2, 2026, 10:42 AM" in the viewer's locale, or null when unknown. */
export function formatDateTime(
	value: Date | string | number | null,
) {
	return (
		parse(value)?.toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}) ?? null
	);
}

/** "Sep 2, 10:42 AM" in the viewer's locale, or null when unknown. */
export function formatShortDateTime(
	value: Date | string | number | null,
) {
	return (
		parse(value)?.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		}) ?? null
	);
}

/**
 * "Sep 4" in the viewer's locale, with the year when it isn't this one, or
 * null when unknown.
 */
export function formatShortDate(
	value: Date | string | number | null,
) {
	const date = parse(value);
	if (!date) return null;
	const thisYear =
		date.getFullYear() === new Date().getFullYear();
	return date.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		...(thisYear ? {} : { year: 'numeric' }),
	});
}

/** "Sep 4, 2026" in the viewer's locale, or null when unknown. */
export function formatDate(value: Date | string | null) {
	return (
		parse(value)?.toLocaleDateString(undefined, {
			dateStyle: 'medium',
		}) ?? null
	);
}
