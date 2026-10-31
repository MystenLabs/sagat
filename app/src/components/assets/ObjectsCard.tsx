// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ArrowLeft,
	ArrowRight,
	Box,
	Search,
	X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { content } from '@/content';
import { useOwnedObjects } from '@/hooks/useOwnedObjects';
import { useRecognizedCoins } from '@/hooks/useRecognizedCoins';
import {
	FIRST_PAGE,
	objectsFilterKey,
	parseTypeFilter,
	type ObjectsFilter,
	type PageStart,
} from '@/lib/owned-objects';
import {
	objectView,
	SYSTEM_OBJECT_KINDS,
	systemTypeName,
	type SystemObjectKind,
} from '@/lib/systemObjects';
import { cn } from '@/lib/utils';

import { Button } from '../ui/button';
import { cardClass, CardHeading } from '../ui/card';
import { EmptyState, ErrorState } from '../ui/empty-state';
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from '../ui/input-group';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from '../ui/select';
import { tableClass, tableHeadRowClass } from '../ui/table';
import { ObjectRow, ObjectSkeletonRows } from './ObjectRow';

const COPY = content.assets.objects;

/** How long typing settles before the filter applies. */
const FILTER_DEBOUNCE_MS = 300;
/** Placeholder rows while a page loads. */
const SKELETON_ROWS = 8;

type TypeChoice = 'all' | SystemObjectKind | 'other';

function choiceLabel(choice: TypeChoice): string {
	if (choice === 'all') return COPY.allTypes;
	if (choice === 'other') return COPY.otherTypes;
	return systemTypeName(choice);
}

/**
 * The objects the pod owns, other than coins, a page at a time: filtered
 * by a known system type, by every other type, or by a type typed in.
 * Read-only: using an object goes through a proposal.
 */
export function ObjectsCard({
	address,
}: {
	address: string;
}) {
	const [choice, setChoice] = useState<TypeChoice>('all');
	const [text, setText] = useState('');
	const [typed, setTyped] = useState('');

	useEffect(() => {
		const timer = setTimeout(
			() => setTyped(text.trim()),
			FILTER_DEBOUNCE_MS,
		);
		return () => clearTimeout(timer);
	}, [text]);

	const typedType = typed ? parseTypeFilter(typed) : null;
	const invalidType = !!typed && !typedType;
	const filter: ObjectsFilter = typedType
		? { kind: 'type', type: typedType }
		: choice === 'all' || choice === 'other'
			? { kind: choice }
			: { kind: 'system', system: choice };
	const filterKey = objectsFilterKey(filter);

	// The starts of the pages so far, for Back. A new filter starts over.
	const [pager, setPager] = useState<{
		key: string;
		starts: PageStart[];
	}>({ key: filterKey, starts: [FIRST_PAGE] });
	const starts =
		pager.key === filterKey ? pager.starts : [FIRST_PAGE];
	const page = starts.length;

	const query = useOwnedObjects(
		address,
		filter,
		starts[starts.length - 1],
	);
	const recognized = useRecognizedCoins();
	const views = useMemo(
		() =>
			(query.data?.rows ?? []).map((object) =>
				objectView(
					object,
					(coinType) =>
						recognized.map.get(coinType)?.symbol ??
						undefined,
				),
			),
		[query.data, recognized.map],
	);
	const next = query.data?.next ?? null;

	const pickChoice = (value: TypeChoice) => {
		setChoice(value);
		setText('');
		setTyped('');
	};
	const typeText = (value: string) => {
		setText(value);
		setChoice('all');
	};

	const noRows =
		!query.isLoading &&
		!query.isError &&
		views.length === 0;
	// A page can come back without rows and still have more after it, when
	// its node calls ran out on coins; only one with nothing left is empty.
	const empty = noRows && page === 1 && !next;

	return (
		<section
			className={cardClass}
			aria-labelledby="objects-title"
			data-testid="objects"
		>
			<div className="flex flex-wrap items-start gap-x-6 gap-y-3">
				<div className="flex min-w-0 flex-1 basis-80 flex-col gap-1 @3xl:flex-row @3xl:items-center @3xl:gap-6">
					<CardHeading
						id="objects-title"
						title={COPY.title}
					/>
					<p className="text-13 text-muted-foreground">
						{COPY.description}
					</p>
				</div>
				<div className="flex w-full flex-col gap-1.5 sm:w-auto">
					<div className="flex flex-col gap-2 sm:flex-row">
						<Select
							value={choice}
							onValueChange={(value) => {
								if (typeof value === 'string')
									pickChoice(value as TypeChoice);
							}}
						>
							<SelectTrigger
								className="w-full shrink-0 sm:w-40"
								aria-label={COPY.typeSelectLabel}
								data-testid="objects-type-select"
								data-value={choice}
							>
								<span className="flex-1 truncate text-left">
									{choiceLabel(choice)}
								</span>
							</SelectTrigger>
							<SelectContent alignItemWithTrigger={false}>
								{(
									[
										'all',
										...SYSTEM_OBJECT_KINDS,
										'other',
									] as TypeChoice[]
								).map((value) => (
									<SelectItem
										key={value}
										value={value}
										data-testid="objects-type-option"
										data-value={value}
									>
										{choiceLabel(value)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<InputGroup className="min-w-0 sm:w-80 sm:flex-1">
							<InputGroupAddon>
								<Search />
							</InputGroupAddon>
							<InputGroupInput
								value={text}
								onChange={(e) => typeText(e.target.value)}
								placeholder={COPY.filterPlaceholder}
								aria-label={COPY.filterLabel}
								aria-invalid={invalidType || undefined}
								aria-describedby={
									invalidType
										? 'objects-filter-error'
										: undefined
								}
								spellCheck={false}
								className="font-mono placeholder:font-sans md:text-12 md:placeholder:text-13"
								data-testid="objects-filter-input"
							/>
							{text && (
								<InputGroupAddon align="inline-end">
									<InputGroupButton
										size="icon-xs"
										onClick={() => typeText('')}
										aria-label={COPY.clearFilter}
										data-testid="objects-filter-clear"
									>
										<X />
									</InputGroupButton>
								</InputGroupAddon>
							)}
						</InputGroup>
					</div>
					{invalidType && (
						<p
							id="objects-filter-error"
							className="text-12 text-error-foreground"
							data-testid="objects-filter-error"
						>
							{COPY.invalidType}
						</p>
					)}
				</div>
			</div>

			{query.isError ? (
				<ErrorState
					title={COPY.loadFailed}
					error={query.error}
					onRetry={() => void query.refetch()}
					retrying={query.isFetching}
					testId="objects-error"
				/>
			) : empty ? (
				<EmptyState
					icon={Box}
					title={
						filter.kind === 'all'
							? COPY.emptyTitle
							: COPY.emptyFilteredTitle
					}
					description={
						filter.kind === 'all'
							? COPY.emptyDescription
							: undefined
					}
					className="border-0"
					testId="objects-empty"
				/>
			) : (
				<>
					<div className="relative overflow-x-auto">
						<table
							className={cn(tableClass, 'sm:min-w-160')}
							aria-busy={query.isLoading || undefined}
							data-testid="objects-table"
						>
							<thead>
								<tr className={tableHeadRowClass}>
									<th className="px-3">{COPY.object}</th>
									<th className="hidden w-[30%] px-3 sm:table-cell">
										{content.common.fields.type}
									</th>
									<th className="w-32 px-3 sm:w-40">
										{COPY.objectId}
									</th>
									{/* Phones leave the link out: the object id links there too. */}
									<th className="hidden w-14 px-3 sm:table-cell">
										<span className="sr-only">
											{content.common.fields.actions}
										</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{query.isLoading ? (
									<ObjectSkeletonRows
										rows={SKELETON_ROWS}
									/>
								) : noRows ? (
									<tr>
										<td
											colSpan={4}
											className="px-3 py-6 text-center text-13 text-muted-foreground"
											data-testid="objects-page-empty"
										>
											{COPY.emptyPage}
										</td>
									</tr>
								) : (
									views.map((view) => (
										<ObjectRow
											key={view.objectId}
											view={view}
										/>
									))
								)}
							</tbody>
						</table>
					</div>
					{(page > 1 || next) && (
						<Pager
							page={page}
							loading={query.isLoading}
							onBack={() =>
								setPager({
									key: filterKey,
									starts: starts.slice(0, -1),
								})
							}
							onNext={
								next
									? () =>
											setPager({
												key: filterKey,
												starts: [...starts, next],
											})
									: undefined
							}
						/>
					)}
				</>
			)}
		</section>
	);
}

function Pager({
	page,
	loading,
	onBack,
	onNext,
}: {
	page: number;
	loading: boolean;
	onBack: () => void;
	onNext?: () => void;
}) {
	return (
		<nav
			className="flex items-center justify-end gap-2"
			data-testid="objects-pager"
		>
			<Button
				variant="outline"
				size="icon-sm"
				onClick={onBack}
				disabled={loading || page === 1}
				aria-label={COPY.previousPage}
				data-testid="objects-previous-page"
			>
				<ArrowLeft />
			</Button>
			<span
				className="text-13 tabular-nums"
				aria-live="polite"
				data-testid="objects-page"
				data-page={page}
			>
				{COPY.page(page)}
			</span>
			<Button
				variant="outline"
				size="icon-sm"
				onClick={onNext}
				disabled={loading || !onNext}
				aria-label={COPY.nextPage}
				data-testid="objects-next-page"
			>
				<ArrowRight />
			</Button>
		</nav>
	);
}
