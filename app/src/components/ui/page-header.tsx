// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

export interface Crumb {
	label: string;
	to?: string;
}

interface PageHeaderProps {
	title: ReactNode;
	/** Small uppercase trail above the title. */
	breadcrumb?: Crumb[];
	/**
	 * A small uppercase line above the title, as plain text: the account
	 * on its pages. `mono` for an address: mono, not uppercased.
	 */
	eyebrow?: { label: string; mono?: boolean };
	description?: ReactNode;
	/** A back link in the breadcrumb's place: "← Proposals". */
	backLink?: string;
	backLabel?: string;
	actions?: ReactNode;
	className?: string;
}

/**
 * Page header from the designs: a breadcrumb, back link or eyebrow, the
 * 30px title and an optional description on the left, actions on the
 * right.
 */
export function PageHeader({
	title,
	breadcrumb,
	eyebrow,
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
										className="truncate hover:text-foreground"
									>
										{crumb.label}
									</Link>
								) : (
									<span
										className="truncate"
										aria-current="page"
									>
										{crumb.label}
									</span>
								)}
							</Fragment>
						))}
					</nav>
				) : backLink ? (
					<Link
						to={backLink}
						className="inline-flex w-fit items-center gap-1 text-11 tracking-[0.02em] text-muted-foreground uppercase hover:text-foreground"
						data-testid="page-header-back"
					>
						<ArrowLeft className="size-3" />
						{backLabel}
					</Link>
				) : (
					eyebrow && (
						<p
							className={cn(
								'truncate text-11 tracking-[0.02em] text-muted-foreground uppercase',
								eyebrow.mono && 'font-mono normal-case',
							)}
							data-testid="page-header-eyebrow"
						>
							{eyebrow.label}
						</p>
					)
				)}
				<h1 className="text-24 font-bold text-foreground sm:text-30">
					{title}
				</h1>
				{description && (
					<p className="text-14 text-muted-foreground">
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
