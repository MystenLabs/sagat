// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigWithMembers } from '@mysten/sagat';
import {
	formatAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { MemberName } from '@/components/multisig/MemberName';
import { Button } from '@/components/ui/button';
import {
	cardClass,
	CardHeading,
} from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { CopyButton } from '@/components/ui/CopyButton';
import {
	tableClass,
	tableHeadRowClass,
	tableRowClass,
} from '@/components/ui/table';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { content } from '@/content';
import { useAddProposer } from '@/hooks/useAddProposer';
import { useProposerProofs } from '@/hooks/useProposerProofs';
import { accountName } from '@/lib/account-name';
import { formatDate } from '@/lib/dates';
import { memberLabels } from '@/lib/signers';
import { cn } from '@/lib/utils';

import { AddProposerDialog } from './AddProposerDialog';
import { RemoveProposerDialog } from './RemoveProposerDialog';

const COPY = content.proposers;

const PROOF_CHIP = {
	unverified: {
		variant: 'warning',
		label: COPY.status.unverified,
		tooltip: COPY.status.unverifiedTooltip,
	},
	invalid: {
		variant: 'error',
		label: COPY.status.invalid,
		tooltip: COPY.status.invalidTooltip,
	},
} as const;

/**
 * The account's external proposers as a card: each address with the day it
 * was added and the signer who confirmed it, a way to re-confirm one that
 * isn't confirmed and to remove it, plus a button to add one.
 */
export function ProposersSection({
	multisig,
	currentAddress,
	className,
}: {
	multisig: Pick<
		MultisigWithMembers,
		| 'address'
		| 'name'
		| 'threshold'
		| 'members'
		| 'proposers'
	>;
	/**
	 * The signed-in address, marked "(you)" when it added or confirmed a
	 * proposer.
	 */
	currentAddress: string | undefined;
	className?: string;
}) {
	const { proposers } = multisig;
	const name = accountName(multisig);
	const labels = useMemo(
		() => memberLabels(multisig.members),
		[multisig.members],
	);
	const proofs = useProposerProofs(multisig);
	const reconfirm = useAddProposer(multisig.address, {
		successMessage: content.toasts.proposerReconfirmed,
	});
	const canReconfirm = (address: string) => {
		const status = proofs?.get(address)?.status;
		return status === 'unverified' || status === 'invalid';
	};
	const anyReconfirm = proposers.some((p) =>
		canReconfirm(p.address),
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
				title={COPY.title}
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
						{COPY.addButton}
					</span>
				</Button>
			</CardHeading>

			{proposers.length === 0 ? (
				<p
					className="text-13 text-muted-foreground"
					data-testid="proposers-empty"
				>
					{COPY.empty} {COPY.explanation}
				</p>
			) : (
				<>
					<table className={tableClass}>
						<thead>
							<tr className={tableHeadRowClass}>
								<th className="px-3 whitespace-nowrap">
									{COPY.columns.proposer}
								</th>
								<th className="w-30 px-3 sm:w-40">
									{COPY.columns.added}
								</th>
								<th
									className={cn(
										'px-1.5 sm:px-3',
										anyReconfirm
											? 'w-20 sm:w-58'
											: 'w-12 sm:w-30',
									)}
								>
									<span className="sr-only">
										{content.common.fields.actions}
									</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{proposers.map((proposer) => {
								const proof = proofs?.get(proposer.address);
								// A member proposer is verified without a signer.
								const signer =
									proof?.status === 'verified'
										? proof.signer
										: null;
								const by = normalizeSuiAddress(
									signer ?? proposer.addedBy,
								);
								const date =
									(signer && proof?.createdAt) ||
									proposer.addedAt;
								const chip =
									proof && proof.status !== 'verified'
										? PROOF_CHIP[proof.status]
										: null;
								const isYou =
									!!currentAddress &&
									normalizeSuiAddress(currentAddress) ===
										by;
								const short = formatAddress(
									proposer.address,
								);
								return (
									<tr
										key={proposer.address}
										className={tableRowClass}
										data-testid="proposer-item"
										data-address={proposer.address}
										data-status={proof?.status}
									>
										<td className="px-3 py-2.5">
											<span className="flex items-center gap-1 font-mono text-13 whitespace-nowrap">
												<ShortAddress
													address={proposer.address}
												/>
												<CopyButton
													value={proposer.address}
													size="inline"
													successMessage={
														content.toasts.addressCopied
													}
												/>
											</span>
										</td>
										<td className="px-3 py-2.5">
											<span
												className="block truncate text-13 text-foreground"
												data-testid="proposer-added"
												data-added-at={date}
											>
												{formatDate(date) ?? '—'}
											</span>
											<span
												className="block text-12 break-words text-muted-foreground"
												data-testid="proposer-added-by"
											>
												{signer
													? COPY.confirmedBy
													: COPY.addedBy}{' '}
												<MemberName
													address={by}
													label={labels.get(by) ?? null}
													isYou={isYou}
												/>
											</span>
											{chip && <ProofChip chip={chip} />}
										</td>
										<td className="px-1.5 py-1.5 text-right whitespace-nowrap sm:px-3">
											{canReconfirm(proposer.address) && (
												<Button
													variant="ghost"
													size="sm"
													onClick={() =>
														reconfirm.mutate(
															proposer.address,
														)
													}
													disabled={reconfirm.isPending}
													aria-label={COPY.reconfirmLabel(
														short,
													)}
													data-testid="reconfirm-proposer-button"
												>
													<RefreshCw />
													<span className="max-sm:sr-only">
														{COPY.reconfirm}
													</span>
												</Button>
											)}
											<Button
												variant="ghost"
												size="sm"
												onClick={() => {
													setRemovingAddress(
														proposer.address,
													);
													setRemoving(true);
												}}
												aria-label={COPY.removeLabel(short)}
												data-testid="remove-proposer-button"
											>
												<Trash2 />
												{/* Icon only on phones, where the
											    address needs the room. */}
												<span className="max-sm:sr-only">
													{content.common.actions.remove}
												</span>
											</Button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					<p className="text-13 leading-normal text-foreground-secondary">
						{COPY.explanation}
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

function ProofChip({
	chip,
}: {
	chip: (typeof PROOF_CHIP)[keyof typeof PROOF_CHIP];
}) {
	return (
		<TooltipProvider delay={150}>
			<Tooltip>
				<TooltipTrigger
					render={
						<Chip
							variant={chip.variant}
							size="sm"
							className="mt-1"
							tabIndex={0}
							data-testid="proposer-status"
						/>
					}
				>
					{chip.label}
				</TooltipTrigger>
				<TooltipContent className="max-w-xs">
					{chip.tooltip}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
