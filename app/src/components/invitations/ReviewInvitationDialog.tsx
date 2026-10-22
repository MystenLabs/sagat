// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Check, Info } from 'lucide-react';

import { useApiAuth } from '@/contexts/ApiAuthContext';
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
import { accountName } from './account-name';
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
								Couldn't join {name}
							</DialogTitle>
							<DialogDescription className="text-14 text-muted-foreground">
								Accepting didn't complete. Try again, or
								check your account list in case it went
								through.
							</DialogDescription>
						</div>
						<Alert
							variant="error"
							className="mt-5"
							data-testid="accept-invitation-error"
						>
							{errorMessage(
								error,
								'The wallet rejected the request.',
							)}
						</Alert>
						<div className="mt-5 flex justify-end gap-2 border-t pt-5">
							<Button variant="outline" onClick={onBack}>
								Go back
							</Button>
							<Button
								onClick={onAccept}
								disabled={accepting}
								data-testid="accept-invitation-button"
							>
								Try again
							</Button>
						</div>
					</>
				) : (
					<>
						<div className="flex flex-col gap-1 pr-8">
							<DialogTitle className="text-24 font-bold">
								Join {name}?
							</DialogTitle>
							<DialogDescription className="text-14 text-muted-foreground">
								{creator ? (
									<span className="inline-flex">
										<SignerName
											label={creator.label}
											address={
												creator.label
													? undefined
													: creator.address
											}
											size="inline"
											labelTestId={null}
										/>
									</span>
								) : (
									'Someone'
								)}{' '}
								invited you as a signer.
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
								Sui address
							</div>
							<div className="flex items-center gap-2">
								<span className="min-w-0 flex-1 font-mono text-12 break-all">
									{multisig.address}
								</span>
								<CopyButton
									value={multisig.address}
									size="xs"
									successMessage="Address copied"
								/>
							</div>
						</div>

						<div className="mt-4 overflow-hidden rounded-2xl border">
							<table className="w-full table-fixed text-13">
								<thead>
									<tr className="bg-muted text-left text-12 text-muted-foreground">
										{/* Hidden at phone width so the name and address keep their room. */}
										<th className="hidden w-9 px-3 py-1.5 font-normal sm:table-cell">
											#
										</th>
										<th className="px-3 py-1.5 font-normal">
											Signer
										</th>
										<th className="w-15 px-3 py-1.5 text-right font-normal">
											Weight
										</th>
										<th className="w-24 px-3 py-1.5 font-normal">
											Status
										</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((row, i) => (
										<tr
											key={row.member.publicKey}
											className={cn(
												'border-t',
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
								Check each address before you accept.
								Accepting doesn't move funds or cost gas.
							</span>
						</p>

						<div className="mt-5 flex justify-end gap-2 border-t pt-5">
							<Button
								variant="outline"
								onClick={onReject}
								disabled={accepting}
								data-testid="reject-invitation-open"
							>
								Reject
							</Button>
							<Button
								onClick={onAccept}
								disabled={accepting}
								data-testid="accept-invitation-button"
							>
								<Check strokeWidth={3} />
								{accepting
									? 'Confirm in your wallet…'
									: 'Accept invitation'}
							</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
