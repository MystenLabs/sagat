// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useId, type ReactNode } from 'react';

import { content } from '@/content';
import {
	signerSummary,
	type SignerEntry,
	type SignerSetStatus,
} from '@/lib/signers';
import { cn } from '@/lib/utils';

import { cardClass, CardHeading } from '../ui/card';
import {
	tableClass,
	tableHeadRowClass,
	tableRowClass,
} from '../ui/table';
import { SignerName } from './SignerName';
import { SignerStatusChip } from './SignerStatusChip';

/**
 * The signer set as a card: a numbered row per key with its name over its
 * address, its weight and where its invitation stands. The heading says
 * how many have accepted; `children` go under it, `folded` under the table.
 */
export function SignersCard({
	rows,
	status,
	signerSet,
	className,
	children,
	folded,
}: {
	rows: SignerEntry[];
	status: SignerSetStatus;
	/** The set's address, for a page that shows several sets. */
	signerSet?: string;
	className?: string;
	children?: ReactNode;
	folded?: ReactNode;
}) {
	const summary = signerSummary(status);
	const titleId = useId();

	return (
		<section
			className={cn(cardClass, className)}
			aria-labelledby={titleId}
			data-testid="signers-card"
			data-signer-set={signerSet}
		>
			<CardHeading
				id={titleId}
				title={content.signers.title}
				count={rows.length}
			>
				<span
					className="ml-auto text-right text-13 text-muted-foreground"
					data-testid="signers-summary"
				>
					{summary}
				</span>
			</CardHeading>
			{children}
			<SignersTable rows={rows} />
			{folded}
		</section>
	);
}

export function SignersTable({
	rows,
}: {
	rows: SignerEntry[];
}) {
	return (
		<table className={tableClass}>
			<thead>
				<tr className={tableHeadRowClass}>
					<th className="px-3">
						{content.common.fields.signer}
					</th>
					<th className="w-12 px-3 sm:w-16">
						{content.common.fields.weight}
					</th>
					<th className="w-24 px-3 sm:w-26">
						{content.signers.columns.invitation}
					</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row, i) => (
					<tr
						key={row.member.publicKey}
						className={tableRowClass}
						data-testid="member-item"
						data-address={row.address}
						data-status={row.status}
					>
						<td className="px-3 py-2.5">
							<div className="flex min-w-0 items-center gap-2.5">
								<span
									aria-hidden
									className={cn(
										'flex size-6 shrink-0 items-center justify-center rounded-full text-11 font-medium max-sm:hidden',
										row.isYou
											? 'bg-primary text-primary-foreground'
											: 'bg-secondary text-secondary-foreground',
									)}
								>
									{i + 1}
								</span>
								<SignerName
									label={row.member.label}
									address={row.address}
									marker={row.isYou ? 'you' : null}
									markerStyle="parens"
									copy
									labelTestId="member-label"
								/>
							</div>
						</td>
						<td
							className="px-3 py-2.5 tabular-nums"
							data-testid="member-weight"
						>
							{row.member.weight}
						</td>
						<td className="px-3 py-2.5">
							<SignerStatusChip status={row.status} />
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
