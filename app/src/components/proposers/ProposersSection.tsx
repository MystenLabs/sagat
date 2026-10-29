// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigWithMembers } from '@mysten/sagat';
import {
	formatAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { MemberName } from '@/components/multisig/MemberName';
import { Button } from '@/components/ui/button';
import {
	cardClass,
	CardHeading,
} from '@/components/ui/card';
import { CopyButton } from '@/components/ui/CopyButton';
import {
	tableClass,
	tableHeadRowClass,
	tableRowClass,
} from '@/components/ui/table';
import { accountName } from '@/lib/account-name';
import { formatDate } from '@/lib/dates';
import { memberLabels } from '@/lib/signers';
import { cn } from '@/lib/utils';

import { AddProposerDialog } from './AddProposerDialog';
import { RemoveProposerDialog } from './RemoveProposerDialog';

const EXPLANATION =
	'External proposers are outside addresses, like a payments service, that can create proposals but can’t sign or execute them.';

/**
 * The account's external proposers as a card: each address with the day it
 * was added and by whom, and a way to remove it, plus a button to add one.
 */
export function ProposersSection({
	multisig,
	currentAddress,
	className,
}: {
	multisig: Pick<
		MultisigWithMembers,
		'address' | 'name' | 'members' | 'proposers'
	>;
	/** The signed-in address, marked "(you)" when it added a proposer. */
	currentAddress: string | undefined;
	className?: string;
}) {
	const { proposers } = multisig;
	const name = accountName(multisig);
	const labels = useMemo(
		() => memberLabels(multisig.members),
		[multisig.members],
	);
	const [adding, setAdding] = useState(false);
	// The address outlives the dialog's open state, so the dialog keeps its
	// content while it animates out.
	const [removing, setRemoving] = useState(false);
	const [removingAddress, setRemovingAddress] = useState<
		string | null
	>(null);

	return (
		<section
			className={cn(cardClass, className)}
			aria-labelledby="proposers-title"
			data-testid="proposers-card"
		>
			<CardHeading
				id="proposers-title"
				title="External proposers"
				count={proposers.length}
			>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setAdding(true)}
					className="ml-auto max-sm:size-7 max-sm:px-0"
					data-testid="add-proposer-button"
				>
					<Plus />
					{/* Icon only on phones, so the heading row does not wrap. */}
					<span className="max-sm:sr-only">
						Add external proposer
					</span>
				</Button>
			</CardHeading>

			{proposers.length === 0 ? (
				<p
					className="text-13 text-muted-foreground"
					data-testid="proposers-empty"
				>
					No external proposers yet. {EXPLANATION}
				</p>
			) : (
				<>
					<table className={tableClass}>
						<thead>
							<tr className={tableHeadRowClass}>
								<th className="px-3 whitespace-nowrap">
									External proposer
								</th>
								<th className="w-30 px-3 sm:w-40">Added</th>
								<th className="w-12 px-1.5 sm:w-30 sm:px-3">
									<span className="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{proposers.map((proposer) => {
								const addedBy = normalizeSuiAddress(
									proposer.addedBy,
								);
								const label = labels.get(addedBy) ?? null;
								const isYou =
									!!currentAddress &&
									normalizeSuiAddress(currentAddress) ===
										addedBy;
								return (
									<tr
										key={proposer.address}
										className={tableRowClass}
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
													size="inline"
													successMessage="Address copied"
												/>
											</span>
										</td>
										<td className="px-3 py-2.5">
											<span
												className="block truncate text-13 text-foreground"
												data-testid="proposer-added"
												data-added-at={proposer.addedAt}
											>
												{formatDate(proposer.addedAt) ??
													'—'}
											</span>
											<span
												className="block text-12 break-words text-muted-foreground"
												data-testid="proposer-added-by"
											>
												by{' '}
												<MemberName
													address={proposer.addedBy}
													label={label}
													isYou={isYou}
												/>
											</span>
										</td>
										<td className="px-1.5 py-1.5 text-right sm:px-3">
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
												<Trash2 />
												{/* Icon only on phones, where the
											    address needs the room. */}
												<span className="max-sm:sr-only">
													Remove
												</span>
											</Button>
										</td>
									</tr>
								);
							})}
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
				multisigAddress={multisig.address}
				accountName={name}
			/>
			<RemoveProposerDialog
				open={removing}
				onOpenChange={setRemoving}
				multisigAddress={multisig.address}
				accountName={name}
				proposerAddress={removingAddress}
			/>
		</section>
	);
}
