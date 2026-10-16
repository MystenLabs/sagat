// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import { Info, KeyRound } from 'lucide-react';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import {
	keyTypeFromPublicKey,
	validatePublicKey,
} from '@/lib/sui-utils';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

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
 * address and every signer with their key type, weight and status.
 */
export function ReviewInvitationDialog({
	open,
	onClose,
	multisig,
	onAccept,
	onReject,
	accepting,
}: {
	open: boolean;
	onClose: () => void;
	multisig: MultisigWithMembersForPublicKey;
	onAccept: () => void;
	onReject: () => void;
	accepting: boolean;
}) {
	const { network } = useNetwork();
	const { currentAddress } = useApiAuth();
	const name = accountName(multisig);
	const signers = multisig.members.map((member) => {
		const address = validatePublicKey(
			member.publicKey,
		).address;
		return {
			...member,
			address,
			keyType: keyTypeFromPublicKey(member.publicKey),
			isYou: address === currentAddress?.address,
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
			>
				<div className="flex flex-col gap-1 pr-8">
					<DialogTitle className="text-24 font-bold tracking-[-0.03em]">
						Join {name}?
					</DialogTitle>
					<DialogDescription className="text-14 text-muted-foreground">
						You've been invited as a signer on{' '}
						<span className="capitalize">{network}</span>.
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
						Account address
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
								<th className="w-26 px-3 py-1.5 font-normal">
									Key type
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
											{signer.isYou && (
												<span className="font-sans text-12 text-muted-foreground">
													You
												</span>
											)}
										</span>
									</td>
									<td className="px-3 py-2.5">
										<Chip variant="tag">
											{signer.keyType}
										</Chip>
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
											<Chip variant="error">Rejected</Chip>
										) : (
											<Chip variant="warning">Invited</Chip>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<ul className="mt-4 flex flex-col gap-2 text-13 leading-[1.5] text-foreground-secondary">
					<Note icon={Info}>
						Check each signer address before you accept.
					</Note>
					<Note icon={Info}>
						Accepting adds this account to your sidebar so
						you can see and sign its proposals. It doesn't
						sign a transaction or move funds.
					</Note>
					<Note icon={KeyRound}>
						You'll confirm with your wallet. No gas.
					</Note>
				</ul>

				<div className="mt-5 flex items-center justify-between gap-3 border-t pt-5">
					<Button variant="ghost" onClick={onClose}>
						Decide later
					</Button>
					<div className="flex gap-2">
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
							<KeyRound />
							{accepting
								? 'Confirm in your wallet…'
								: 'Accept invitation'}
						</Button>
					</div>
				</div>
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

function Note({
	icon: Icon,
	children,
}: {
	icon: typeof Info;
	children: React.ReactNode;
}) {
	return (
		<li className="flex items-start gap-2.5">
			<Icon className="mt-0.5 size-4 shrink-0" />
			<span>{children}</span>
		</li>
	);
}
