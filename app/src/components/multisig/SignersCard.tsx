// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	signerSummary,
	type SignerEntry,
	type SignerSetStatus,
} from '@/lib/signers';
import { cn } from '@/lib/utils';

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
	rejectedNames,
	className,
}: {
	rows: SignerEntry[];
	status: SignerSetStatus;
	/** The rejected signers' names, in order. */
	rejectedNames: string[];
	className?: string;
}) {
	const summary = signerSummary(status, rejectedNames);

	return (
		<section
			className={cn(
				'flex flex-col gap-3 rounded-xl border bg-card p-5 md:p-6',
				className,
			)}
			aria-labelledby="signers-title"
			data-testid="signers-card"
		>
			<div className="flex items-center gap-2">
				<h2
					id="signers-title"
					className="text-16 font-medium"
				>
					Signers
				</h2>
				<span className="text-12 text-muted-foreground">
					{rows.length}
				</span>
				<span
					className="ml-auto text-right text-13 text-muted-foreground"
					data-testid="signers-summary"
				>
					{summary}
				</span>
			</div>
			<table className="w-full table-fixed text-13">
				<thead>
					<tr className="bg-muted text-left text-12 text-muted-foreground [&>th]:py-1.75 [&>th]:font-normal [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
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
							className="border-b last:border-b-0"
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
		</section>
	);
}
