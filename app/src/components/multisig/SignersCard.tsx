// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { Chip } from '@/components/ui/chip';
import { CopyButton } from '@/components/ui/copy-button';
import {
	signerSetStatus,
	signerSummary,
	type SignerRow,
} from '@/lib/signers';
import { cn } from '@/lib/utils';

const STATUS_CHIP = {
	accepted: { variant: 'success', label: 'Accepted' },
	rejected: { variant: 'error', label: 'Rejected' },
	pending: { variant: 'warning', label: 'Invited' },
} as const;

/**
 * The signer set as a card: a numbered row per key with its name over its
 * address, its weight and where its invitation stands. The heading says
 * how many have accepted.
 */
export function SignersCard({
	rows,
	threshold,
	className,
}: {
	rows: SignerRow[];
	threshold: number;
	className?: string;
}) {
	const status = signerSetStatus(
		rows.map((r) => r.member),
		threshold,
	);
	const summary = signerSummary(
		status,
		rows
			.filter((r) => r.status === 'rejected')
			.map((r) => r.name),
	);

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
									<SignerCell row={row} />
								</div>
							</td>
							<td
								className="px-3 py-2.5 tabular-nums"
								data-testid="member-weight"
							>
								{row.member.weight}
							</td>
							<td className="px-3 py-2.5">
								<Chip
									variant={STATUS_CHIP[row.status].variant}
								>
									{STATUS_CHIP[row.status].label}
								</Chip>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}

/**
 * The key's name over its short address when the account named it; the
 * short address alone otherwise. "(you)" follows the signed-in key.
 */
function SignerCell({ row }: { row: SignerRow }) {
	const you = row.isYou && (
		<span className="shrink-0 text-muted-foreground">
			(you)
		</span>
	);
	const address = row.address && (
		<span className="flex items-center gap-1 font-mono text-11 text-muted-foreground">
			<ShortAddress address={row.address} />
			<CopyButton
				value={row.address}
				size="sm"
				successMessage="Address copied"
			/>
		</span>
	);

	// An unnamed key goes by its short address, with copy right after it.
	if (!row.member.label)
		return (
			<span className="flex min-w-0 items-center gap-1.5 text-14 font-medium">
				<span className="truncate font-mono text-13">
					{row.name}
				</span>
				{row.address && (
					<CopyButton
						value={row.address}
						size="sm"
						className="shrink-0 text-muted-foreground"
						successMessage="Address copied"
					/>
				)}
				{you}
			</span>
		);

	return (
		<div className="flex min-w-0 flex-col gap-px">
			<span className="flex min-w-0 items-center gap-1.5 text-14 font-medium">
				<span
					className="truncate"
					data-testid="member-label"
				>
					{row.member.label}
				</span>
				{you}
			</span>
			{address}
		</div>
	);
}
