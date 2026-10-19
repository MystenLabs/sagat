// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import { Check, Info } from 'lucide-react';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { validatePublicKey } from '@/lib/sui-utils';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

import { Alert } from '../ui/Alert';
import { Button } from '../ui/button';
import { Chip } from '../ui/chip';
import { CopyButton } from '../ui/CopyButton';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from '../ui/dialog';
import { accountName } from './account-name';

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
	creator: string | null;
	onAccept: () => void;
	onReject: () => void;
	accepting: boolean;
	error: Error | null;
	onBack: () => void;
}) {
	const { network } = useNetwork();
	const { currentAddress } = useApiAuth();
	const name = accountName(multisig);
	const signers = [...multisig.members]
		.sort((a, b) => a.order - b.order)
		.map((member) => {
			const address = validatePublicKey(
				member.publicKey,
			).address;
			return {
				...member,
				address,
				isYou: address === currentAddress?.address,
				isCreator: !!address && address === creator,
			};
		});
	const you = signers.find((s) => s.isYou);
	const accepted = signers.filter(
		(s) => s.isAccepted,
	).length;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				className="gap-0 p-8 sm:max-w-[640px]"
				data-testid="invitation-review"
				data-state-kind={error ? 'failed' : 'review'}
			>
				{error ? (
					<>
						<div className="flex flex-col gap-1 pr-8">
							<DialogTitle className="text-24 font-bold tracking-[-0.03em]">
								Couldn't join {name}
							</DialogTitle>
							<DialogDescription className="text-14 text-muted-foreground">
								Nothing changed: you haven't joined yet.
							</DialogDescription>
						</div>
						<Alert
							variant="error"
							className="mt-5"
							data-testid="accept-invitation-error"
						>
							{error.message}
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
							<DialogTitle className="text-24 font-bold tracking-[-0.03em]">
								Join {name}?
							</DialogTitle>
							<DialogDescription className="text-14 text-muted-foreground">
								{creator ? (
									<span className="font-mono text-13">
										{formatAddress(creator)}
									</span>
								) : (
									'Someone'
								)}{' '}
								invited you as a signer on{' '}
								<span className="capitalize">
									{network}
								</span>
								.
							</DialogDescription>
						</div>

						<dl className="mt-5 grid grid-cols-3 gap-4 rounded-lg bg-surface p-4">
							<Stat
								label="Your weight"
								value={
									you
										? `${you.weight} of ${multisig.totalWeight}`
										: '—'
								}
							/>
							<Stat
								label="Threshold"
								value={`${multisig.threshold} of ${multisig.totalWeight}`}
							/>
							<Stat
								label="Accepted"
								value={`${accepted} of ${multisig.totalMembers}`}
							/>
						</dl>

						<div className="mt-4 flex flex-col gap-1">
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

						<div className="mt-4 overflow-hidden rounded-lg border">
							<table className="w-full text-13">
								<thead>
									<tr className="bg-muted text-left text-12 text-muted-foreground">
										<th className="w-9 px-3 py-1.5 font-normal">
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
									{signers.map((signer, i) => (
										<tr
											key={signer.publicKey}
											className={cn(
												'border-t',
												signer.isYou && 'bg-surface',
											)}
											data-testid="member-item"
											data-address={signer.address}
											data-status={
												signer.isAccepted
													? 'accepted'
													: signer.isRejected
														? 'rejected'
														: 'pending'
											}
										>
											<td className="px-3 py-2.5 text-12 text-muted-foreground">
												{i + 1}
											</td>
											<td className="px-3 py-2.5">
												<span className="flex items-center gap-1.5 font-mono text-12">
													{signer.address
														? formatAddress(signer.address)
														: 'Unknown key'}
													{(signer.isCreator ||
														signer.isYou) && (
														<span className="font-sans text-12 text-muted-foreground">
															{signer.isYou
																? 'You'
																: 'Creator'}
														</span>
													)}
												</span>
											</td>
											<td className="px-3 py-2.5 text-right font-medium">
												{signer.weight}
											</td>
											<td className="px-3 py-2.5">
												{signer.isAccepted ? (
													<Chip variant="success">
														Accepted
													</Chip>
												) : signer.isRejected ? (
													<Chip variant="error">
														Rejected
													</Chip>
												) : (
													<Chip variant="warning">
														Invited
													</Chip>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						<p className="mt-4 flex items-start gap-2.5 text-13 leading-[1.5] text-foreground-secondary">
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

function Stat({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-12 text-muted-foreground">
				{label}
			</dt>
			<dd className="text-14">{value}</dd>
		</div>
	);
}
