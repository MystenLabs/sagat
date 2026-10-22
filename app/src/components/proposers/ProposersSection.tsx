// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigProposer } from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { formatDate } from '@/lib/signers';
import { cn } from '@/lib/utils';

import { AddProposerDialog } from './AddProposerDialog';
import { RemoveProposerDialog } from './RemoveProposerDialog';

const EXPLANATION =
	'External proposers are outside addresses, like a payments service, that can create proposals but can’t sign or execute them.';

/**
 * The account's external proposers as a card: each address with the day it
 * was added and a way to remove it, plus a button to add one.
 */
export function ProposersSection({
	proposers,
	multisigAddress,
	className,
}: {
	proposers: Omit<MultisigProposer, 'multisigAddress'>[];
	multisigAddress: string;
	className?: string;
}) {
	const [adding, setAdding] = useState(false);
	// The address outlives the dialog's open state, so the dialog keeps its
	// content while it animates out.
	const [removing, setRemoving] = useState(false);
	const [removingAddress, setRemovingAddress] = useState<
		string | null
	>(null);

	return (
		<section
			className={cn(
				'flex flex-col gap-3 rounded-xl border bg-card p-5 md:p-6',
				className,
			)}
			aria-labelledby="proposers-title"
			data-testid="proposers-card"
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2
					id="proposers-title"
					className="text-16 font-medium"
				>
					External proposers
				</h2>
				<span className="text-12 text-muted-foreground">
					{proposers.length}
				</span>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setAdding(true)}
					className="ml-auto"
					data-testid="add-proposer-button"
				>
					<Plus />
					Add external proposer
				</Button>
			</div>

			{proposers.length === 0 ? (
				<p
					className="text-13 text-muted-foreground"
					data-testid="proposers-empty"
				>
					No external proposers yet. {EXPLANATION}
				</p>
			) : (
				<>
					<table className="w-full table-fixed text-13">
						<thead>
							<tr className="bg-muted text-left text-12 text-muted-foreground [&>th]:py-1.75 [&>th]:font-normal [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
								<th className="px-3 whitespace-nowrap">
									External proposer
								</th>
								<th className="w-22 px-3 sm:w-27">Added</th>
								<th className="w-18 px-3 sm:w-22">
									<span className="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{proposers.map((proposer) => (
								<tr
									key={proposer.address}
									className="border-b last:border-b-0"
									data-testid="proposer-item"
									data-address={proposer.address}
								>
									<td className="px-3 py-2.5">
										<span className="flex items-center gap-1 font-mono text-13">
											<ShortAddress
												address={proposer.address}
											/>
											<CopyButton
												value={proposer.address}
												size="sm"
												successMessage="Address copied"
											/>
										</span>
									</td>
									<td className="px-3 py-2.5 whitespace-nowrap">
										{formatDate(proposer.addedAt) ?? '—'}
									</td>
									<td className="px-3 py-1.5 text-right">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												setRemovingAddress(
													proposer.address,
												);
												setRemoving(true);
											}}
											aria-label={`Remove ${formatAddress(proposer.address)}`}
											data-testid="remove-proposer-button"
										>
											Remove
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<p className="text-13 leading-normal text-foreground-secondary">
						{EXPLANATION}
					</p>
				</>
			)}

			<AddProposerDialog
				open={adding}
				onOpenChange={setAdding}
				multisigAddress={multisigAddress}
			/>
			<RemoveProposerDialog
				open={removing}
				onOpenChange={setRemoving}
				multisigAddress={multisigAddress}
				proposerAddress={removingAddress}
			/>
		</section>
	);
}
