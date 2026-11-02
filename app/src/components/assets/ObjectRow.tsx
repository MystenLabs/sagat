// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowUpRight, Box } from 'lucide-react';
import { Fragment } from 'react';

import { content } from '@/content';
import { useNetwork } from '@/contexts/NetworkContext';
import { formatType } from '@/lib/coin-type';
import { type ObjectView } from '@/lib/systemObjects';
import { cn, getExplorerUrl } from '@/lib/utils';

import { ShortAddress } from '../invitations/ShortAddress';
import { buttonVariants } from '../ui/button';
import { Skeleton, SkeletonLine } from '../ui/skeleton';
import { tableRowClass } from '../ui/table';

const COPY = content.assets.objects;

/**
 * One owned object in the objects table, from its view model: an icon
 * tile with its name and subtitle, its type, its id, and a link to it on
 * the explorer where there is one.
 */
export function ObjectRow({ view }: { view: ObjectView }) {
	const { network } = useNetwork();
	const explorerUrl = getExplorerUrl(
		view.objectId,
		network,
		'object',
	);
	return (
		<tr
			className={cn(tableRowClass, 'h-15')}
			data-testid="object-row"
			data-object-id={view.objectId}
			data-type={view.type}
			data-kind={view.kind}
		>
			<td className="px-3 py-2">
				<div className="flex min-w-0 items-center gap-2.5">
					{/* Phones leave the tile out, so the subtitle's ids fit. */}
					<span
						aria-hidden
						className="hidden size-8 shrink-0 items-center justify-center rounded-md bg-muted sm:flex"
					>
						<Box className="size-4" />
					</span>
					<div className="flex min-w-0 flex-col gap-0.5">
						<span
							className="truncate text-14 font-medium"
							data-testid="object-name"
						>
							{view.name}
						</span>
						{view.subtitle.length > 0 && (
							<span
								className="flex min-w-0 flex-wrap items-center text-12 text-muted-foreground"
								data-testid="object-subtitle"
							>
								{COPY.subtitle(view.subtitle).map(
									(part, i) =>
										typeof part === 'string' ? (
											<span key={i}>{part}</span>
										) : (
											<SubtitlePart key={i} part={part} />
										),
								)}
							</span>
						)}
					</div>
				</div>
			</td>
			{/* Phones leave the type out: the name and subtitle say what it is. */}
			<td className="hidden px-3 py-2 sm:table-cell">
				<span
					className="block truncate font-mono text-12"
					title={view.type}
				>
					{formatType(view.type)}
				</span>
			</td>
			<td className="px-3 py-2">
				<ObjectId id={view.objectId} testId="object-id" />
			</td>
			{/* A link here too, one tap away rather than two. */}
			<td className="py-2 pr-3 text-right sm:pl-3">
				{explorerUrl && (
					<a
						href={explorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						className={buttonVariants({
							variant: 'outline',
							size: 'icon-sm',
						})}
						aria-label={
							content.common.actions.viewOnExplorer
						}
						title={content.common.actions.viewOnExplorer}
						data-testid="object-explorer-link"
					>
						<ArrowUpRight />
					</a>
				)}
			</td>
		</tr>
	);
}

/** One part of an object's subtitle: some text, or a labelled id. */
function SubtitlePart({
	part,
}: {
	part: ObjectView['subtitle'][number];
}) {
	if (part.kind === 'text')
		return <span className="truncate">{part.text}</span>;
	return (
		<span className="inline-flex shrink-0 items-center whitespace-nowrap">
			{COPY.labelledId(
				part.label,
				<ObjectId
					id={part.id}
					testId="object-subtitle-id"
				/>,
			).map((node, i) => (
				<Fragment key={i}>{node}</Fragment>
			))}
		</span>
	);
}

/**
 * An object id, short, with the full one, a copy button and a link to
 * the explorer in its popup.
 */
function ObjectId({
	id,
	testId,
}: {
	id: string;
	testId: string;
}) {
	const { network } = useNetwork();
	return (
		<span
			className="inline-flex shrink-0 font-mono text-12"
			data-testid={testId}
			data-id={id}
		>
			<ShortAddress
				address={id}
				explorerUrl={getExplorerUrl(id, network, 'object')}
			/>
		</span>
	);
}

/** Placeholder rows under the table's header while a page loads. */
export function ObjectSkeletonRows({
	rows,
}: {
	rows: number;
}) {
	return Array.from({ length: rows }).map((_, i) => (
		<tr
			key={i}
			className={cn(tableRowClass, 'h-15')}
			aria-hidden
		>
			<td className="px-3 py-2">
				<div className="flex items-center gap-2.5">
					<Skeleton className="hidden size-8 shrink-0 rounded-md sm:block" />
					<div className="flex flex-col gap-1.5">
						<SkeletonLine
							className={i % 2 ? 'w-14' : 'w-18'}
						/>
						<SkeletonLine
							className={i % 3 ? 'w-20' : 'w-28'}
						/>
					</div>
				</div>
			</td>
			<td className="hidden px-3 py-2 sm:table-cell">
				<SkeletonLine className={i % 2 ? 'w-36' : 'w-40'} />
			</td>
			<td className="px-3 py-2">
				<SkeletonLine className="w-20 sm:w-22" />
			</td>
			<td />
		</tr>
	));
}
