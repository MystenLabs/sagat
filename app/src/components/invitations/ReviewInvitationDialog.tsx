// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Check, Info } from 'lucide-react';

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { accountName } from '@/lib/account-name';
import { weightTone } from '@/lib/member-status';
import { signerRows } from '@/lib/signers';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn, errorMessage } from '@/lib/utils';

import { SignerName } from '../multisig/SignerName';
import { SignerStatusChip } from '../multisig/SignerStatusChip';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/button';
import { CopyButton } from '../ui/CopyButton';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from '../ui/dialog';
import {
	tableClass,
	tableRowClass,
	tableShellClass,
	tableShellHeadRowClass,
} from '../ui/table';
import { WeightBar } from './WeightBar';

/**
 * The invitation in full before accepting: the account's setup, its
 * address and every signer with their weight and status. Accepting signs
 * with the wallet right away; if that fails the dialog says so and lets
 * you go back to the review.
 */
export function ReviewInvitationDialog({
	open,
	onClose,
	multisig,
	creator,
	onAccept,
	onReject,
	accepting,
	error,
	onBack,
}: {
	open: boolean;
	onClose: () => void;
	multisig: MultisigWithMembersForPublicKey;
	creator: { address: string; label: string | null } | null;
	onAccept: () => void;
	onReject: () => void;
	accepting: boolean;
	error: unknown;
	onBack: () => void;
}) {
	const { currentAddress } = useApiAuth();
	const name = accountName(multisig);
	const rows = signerRows(
		multisig.members,
		currentAddress?.address,
		creator?.address,
	);
	const you = rows.find((row) => row.isYou);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// Closing mid-sign would reset the request and allow a second one.
				if (!next && !accepting) onClose();
			}}
		>
			<DialogContent
				closeDisabled={accepting}
				className="gap-0 p-8 sm:max-w-[640px]"
				data-testid="invitation-review"
				data-state-kind={error ? 'failed' : 'review'}
			>
				{error ? (
					<>
						<div className="flex flex-col gap-1 pr-8">
							<DialogTitle className="text-24 font-bold">
								{content.invitations.reviewDialog.failedTitle(
									name,
								)}
							</DialogTitle>
							<DialogDescription className="text-14 text-muted-foreground">
								{
									content.invitations.reviewDialog
										.failedDescription
								}
							</DialogDescription>
						</div>
						<Alert
							variant="error"
							className="mt-5"
							data-testid="accept-invitation-error"
						>
							{errorMessage(
								error,
								content.invitations.walletRejected,
							)}
						</Alert>
						<div className="mt-5 flex justify-end gap-2 border-t pt-5">
							<Button variant="outline" onClick={onBack}>
								{content.invitations.goBack}
							</Button>
							<Button
								onClick={onAccept}
								disabled={accepting}
								data-testid="accept-invitation-button"
							>
								{content.common.tryAgain}
							</Button>
						</div>
					</>
				) : (
					<>
						<div className="flex flex-col gap-1 pr-8">
							<DialogTitle className="text-24 font-bold">
								{content.invitations.reviewDialog.title(
									name,
								)}
							</DialogTitle>
							<DialogDescription className="text-14 text-muted-foreground">
								{creator ? (
									<SignerName
										label={creator.label}
										address={
											creator.label
												? undefined
												: creator.address
										}
										size="inline"
									/>
								) : (
									content.invitations.reviewDialog.someone
								)}{' '}
								{
									content.invitations.reviewDialog
										.invitedYou
								}
							</DialogDescription>
						</div>

						<div className="mt-5">
							<WeightBar
								signers={rows.map((row) => ({
									weight: row.member.weight,
									tone: weightTone({
										isAccepted: row.member.isAccepted,
										isYou: row.isYou,
									}),
								}))}
								threshold={multisig.threshold}
								yourWeight={you?.member.weight ?? null}
							/>
						</div>

						<div className="mt-5 flex flex-col gap-1">
							<div className="text-12 text-muted-foreground">
								{
									content.invitations.reviewDialog
										.suiAddress
								}
							</div>
							<div className="flex items-center gap-2">
								<span className="min-w-0 flex-1 font-mono text-12 break-all">
									{multisig.address}
								</span>
								<CopyButton
									value={multisig.address}
									size="xs"
									successMessage={
										content.toasts.addressCopied
									}
								/>
							</div>
						</div>

						<div className={cn('mt-4', tableShellClass)}>
							<table className={tableClass}>
								<thead>
									<tr className={tableShellHeadRowClass}>
										{/* Hidden at phone width so the name and address keep their room. */}
										<th className="hidden w-9 px-3 sm:table-cell">
											#
										</th>
										<th className="px-3">
											{
												content.invitations.reviewDialog
													.signerColumn
											}
										</th>
										<th className="w-15 px-3 text-right">
											{
												content.invitations.reviewDialog
													.weightColumn
											}
										</th>
										<th className="w-24 px-3">
											{
												content.invitations.reviewDialog
													.statusColumn
											}
										</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((row, i) => (
										<tr
											key={row.member.publicKey}
											className={cn(
												tableRowClass,
												row.isYou && 'bg-surface',
											)}
											data-testid="member-item"
											data-address={row.address}
											data-status={row.status}
										>
											<td className="hidden px-3 py-2.5 text-12 text-muted-foreground sm:table-cell">
												{i + 1}
											</td>
											<td className="px-3 py-1">
												<SignerName
													label={row.member.label}
													address={row.address}
													marker={
														row.isYou
															? 'you'
															: row.isCreator
																? 'creator'
																: null
													}
													size="sm"
													labelTestId="member-label"
												/>
											</td>
											<td className="px-3 py-2.5 text-right font-medium">
												{row.member.weight}
											</td>
											<td className="px-3 py-2.5">
												<SignerStatusChip
													status={row.status}
												/>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						<p className="mt-4 flex items-start gap-2.5 text-13 text-foreground-secondary">
							<Info className="mt-0.5 size-4 shrink-0" />
							<span>
								{content.invitations.reviewDialog.note}
							</span>
						</p>

						<div className="mt-5 flex justify-end gap-2 border-t pt-5">
							<Button
								variant="outline"
								onClick={onReject}
								disabled={accepting}
								data-testid="reject-invitation-open"
							>
								{content.invitations.reviewDialog.reject}
							</Button>
							<Button
								onClick={onAccept}
								disabled={accepting}
								data-testid="accept-invitation-button"
							>
								<Check strokeWidth={3} />
								{accepting
									? content.invitations.confirmInWallet
									: content.invitations.reviewDialog.accept}
							</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
