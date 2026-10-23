// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	signerSummary,
	type SignerEntry,
	type SignerSetStatus,
} from '@/lib/signers';
import { cn } from '@/lib/utils';

import { Card } from '../ui/card';
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
 * how many have accepted.
 */
export function SignersCard({
	rows,
	status,
	className,
}: {
	rows: SignerEntry[];
	status: SignerSetStatus;
	className?: string;
}) {
	const summary = signerSummary(status);

	return (
		<Card
			title="Signers"
			titleId="signers-title"
			count={rows.length}
			trailing={
				<span
					className="ml-auto text-right text-13 text-muted-foreground"
					data-testid="signers-summary"
				>
					{summary}
				</span>
			}
			className={className}
			testId="signers-card"
		>
			<table className={tableClass}>
				<thead>
					<tr className={tableHeadRowClass}>
						<th className="px-3">Signer</th>
						<th className="w-12 px-3 sm:w-16">Weight</th>
						<th className="w-24 px-3 sm:w-26">
							Invitation
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
											'flex size-6 shrink-0 items-center justify-center rounded-full text-11 font-medium',
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
		</Card>
	);
}
