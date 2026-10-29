// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

export interface Crumb {
	label: string;
	to?: string;
	/** Addresses and digests: mono, not uppercased. */
	mono?: boolean;
}

interface PageHeaderProps {
	title: ReactNode;
	/** Small uppercase trail above the title. */
	breadcrumb?: Crumb[];
	description?: ReactNode;
	/** Older pages: a back link instead of a breadcrumb. */
	backLink?: string;
	backLabel?: string;
	actions?: ReactNode;
	className?: string;
}

/**
 * Page header from the designs: breadcrumb, 30px title and optional
 * description on the left, actions on the right.
 */
export function PageHeader({
	title,
	breadcrumb,
	description,
	backLink,
	backLabel = 'Back',
	actions,
	className,
}: PageHeaderProps) {
	return (
		<div
			className={cn(
				// Actions sit beside the title and only wrap under it when the
				// title block would be squeezed below 12rem.
				'mb-7 flex flex-wrap items-start justify-between gap-x-4 gap-y-3',
				className,
			)}
		>
			<div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
				{breadcrumb && breadcrumb.length > 0 ? (
					<nav
						aria-label="Breadcrumb"
						className="flex items-center gap-1.5 text-11 tracking-[0.02em] text-muted-foreground uppercase"
					>
						{breadcrumb.map((crumb, i) => (
							<Fragment key={i}>
								{i > 0 && (
									<span aria-hidden className="opacity-60">
										›
									</span>
								)}
								{crumb.to ? (
									<Link
										to={crumb.to}
										className={cn(
											'truncate hover:text-foreground',
											crumb.mono && 'font-mono normal-case',
										)}
									>
										{crumb.label}
									</Link>
								) : (
									<span
										className={cn(
											'truncate',
											crumb.mono && 'font-mono normal-case',
										)}
										aria-current="page"
									>
										{crumb.label}
									</span>
								)}
							</Fragment>
						))}
					</nav>
				) : (
					backLink && (
						<Link
							to={backLink}
							className="mb-2 inline-flex items-center gap-1 text-13 text-muted-foreground hover:text-foreground"
						>
							<ArrowLeft className="size-4" />
							{backLabel}
						</Link>
					)
				)}
				<h1 className="text-24 font-bold text-foreground sm:text-30">
					{title}
				</h1>
				{description && (
					<p className="text-13 text-muted-foreground">
						{description}
					</p>
				)}
			</div>
			{actions && (
				<div className="flex shrink-0 items-center gap-2">
					{actions}
				</div>
			)}
		</div>
	);
}
