// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The head row inside a rounded shell (`tableShellClass` or the wizard's
 * own `rounded-lg` one): small muted labels on a flush muted band, since
 * the shell's corners already round it.
 */
export const tableShellHeadRowClass =
	'bg-muted text-left text-12 text-muted-foreground [&>th]:py-1.75 [&>th]:font-normal';

/**
 * The header row of the account tabs' plain tables: the same band with
 * its own rounded ends. Built by adding the corners rather than with
 * `cn`, as Fast Refresh only allows literal constants beside components.
 */
export const tableHeadRowClass = `${tableShellHeadRowClass} [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md`;

/** The account tabs' plain tables: fixed columns at body size. */
export const tableClass = 'w-full table-fixed text-13';

/** A body row of those tables: a hairline under every row but the last. */
export const tableRowClass = 'border-b last:border-b-0';

/** The rounded, bordered shell a table sits in when it isn't in a card. */
export const tableShellClass =
	'overflow-hidden rounded-2xl border bg-card';

function Table({
	className,
	...props
}: React.ComponentProps<'table'>) {
	return (
		<div
			data-slot="table-container"
			className="relative w-full overflow-x-auto"
		>
			<table
				data-slot="table"
				className={cn(
					'w-full caption-bottom text-sm',
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function TableHeader({
	className,
	...props
}: React.ComponentProps<'thead'>) {
	return (
		<thead
			data-slot="table-header"
			className={cn('[&_tr]:border-b', className)}
			{...props}
		/>
	);
}

function TableBody({
	className,
	...props
}: React.ComponentProps<'tbody'>) {
	return (
		<tbody
			data-slot="table-body"
			className={cn(
				'[&_tr:last-child]:border-0',
				className,
			)}
			{...props}
		/>
	);
}

function TableFooter({
	className,
	...props
}: React.ComponentProps<'tfoot'>) {
	return (
		<tfoot
			data-slot="table-footer"
			className={cn(
				'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
				className,
			)}
			{...props}
		/>
	);
}

function TableRow({
	className,
	...props
}: React.ComponentProps<'tr'>) {
	return (
		<tr
			data-slot="table-row"
			className={cn(
				'border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({
	className,
	...props
}: React.ComponentProps<'th'>) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0',
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({
	className,
	...props
}: React.ComponentProps<'td'>) {
	return (
		<td
			data-slot="table-cell"
			className={cn(
				'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0',
				className,
			)}
			{...props}
		/>
	);
}

function TableCaption({
	className,
	...props
}: React.ComponentProps<'caption'>) {
	return (
		<caption
			data-slot="table-caption"
			className={cn(
				'mt-4 text-sm text-muted-foreground',
				className,
			)}
			{...props}
		/>
	);
}

export {
	Table,
	TableHeader,
	TableBody,
	TableFooter,
	TableHead,
	TableRow,
	TableCell,
	TableCaption,
};
