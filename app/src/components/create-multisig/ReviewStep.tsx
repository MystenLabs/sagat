// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft, Pen } from 'lucide-react';
import { type ReactNode } from 'react';

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { Button } from '@/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { type SignerDraft } from '@/lib/create-multisig';
import { validatePublicKey } from '@/lib/sui-utils';
import { cn } from '@/lib/utils';

import {
	CopyText,
	disabledButton,
	Divider,
	Notice,
	SectionHeading,
} from './parts';

/** Step 3: everything at a glance, then create. */
export function ReviewStep({
	name,
	signers,
	creatorName,
	threshold,
	totalWeight,
	address,
	creating,
	error,
	onEditName,
	onEditSigners,
	onBack,
	onCreate,
}: {
	name: string;
	signers: SignerDraft[];
	creatorName: string | null;
	threshold: number;
	totalWeight: number;
	address: string;
	creating: boolean;
	/** Why the last attempt failed, or null. */
	error: string | null;
	onEditName: () => void;
	onEditSigners: () => void;
	onBack: () => void;
	onCreate: () => void;
}) {
	return (
		<div
			className="flex flex-col gap-4.5 p-5 md:p-7"
			data-testid="create-review-step"
		>
			<SectionHeading
				title="Review and create"
				description="Check the setup before you create the multisig."
			/>

			<dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted p-4 @xl/card:grid-cols-[minmax(0,1fr)_60px_80px_80px]">
				<Summary
					label="Name"
					className="col-span-3 @xl/card:col-span-1"
				>
					<span className="flex min-w-0 items-center gap-1.5">
						<span
							className="truncate"
							data-testid="create-review-name"
						>
							{name.trim()}
						</span>
						<Tooltip>
							<TooltipTrigger
								aria-label="Edit name"
								onClick={onEditName}
								disabled={creating}
								className="flex shrink-0 cursor-pointer items-center rounded-sm p-0.5 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-30"
								data-testid="create-edit-name"
							>
								<Pen className="size-3" />
							</TooltipTrigger>
							<TooltipContent>Edit name</TooltipContent>
						</Tooltip>
					</span>
				</Summary>
				<Summary label="Signers">{signers.length}</Summary>
				<Summary label="Total weight">
					{totalWeight}
				</Summary>
				<Summary label="Threshold">
					{threshold} of {totalWeight}
				</Summary>
			</dl>

			<section className="flex flex-col gap-3">
				<div className="flex items-center justify-between">
					<h3 className="text-14 font-medium">
						Signers and threshold
					</h3>
					<button
						type="button"
						onClick={onEditSigners}
						disabled={creating}
						className="flex cursor-pointer items-center gap-1 rounded-sm text-13 font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:no-underline disabled:opacity-30"
						data-testid="create-edit-signers"
					>
						<Pen className="size-3" />
						Edit
					</button>
				</div>
				<div className="overflow-x-auto rounded-lg border border-foreground/8 bg-card">
					<table className="w-full min-w-150 text-left">
						<thead>
							<tr className="bg-muted text-12 text-muted-foreground">
								<th className="w-10 py-1.75 pl-3 font-normal">
									#
								</th>
								<th className="w-30 py-1.75 font-normal">
									Signer
								</th>
								<th className="py-1.75 font-normal">
									Public key
								</th>
								<th className="w-16 py-1.75 pr-3 text-right font-normal">
									Weight
								</th>
							</tr>
						</thead>
						<tbody>
							{signers.map((signer, i) => {
								const key = signer.key.trim();
								const signerAddress =
									validatePublicKey(key).address;
								return (
									<tr
										key={signer.id}
										className="border-b last:border-b-0"
										data-testid="create-review-signer"
									>
										<td className="py-3 pl-3 align-middle text-12 text-muted-foreground">
											{i + 1}
										</td>
										<td className="py-3 pr-3 align-middle">
											<div className="flex flex-col">
												<span
													className="text-14 break-words"
													data-testid="create-review-signer-name"
												>
													{signer.isCreator
														? creatorName
															? `${creatorName} (you)`
															: 'You'
														: signer.label.trim() ||
															`Signer ${i + 1}`}
												</span>
												{signerAddress && (
													<ShortAddress
														address={signerAddress}
														className="w-fit font-mono text-11 text-muted-foreground"
													/>
												)}
											</div>
										</td>
										<td className="py-3 pr-3 align-middle font-mono text-11 break-all text-foreground-secondary">
											{key}
										</td>
										<td className="py-3 pr-3 text-right align-middle text-13">
											{signer.weight}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>

			<div className="flex flex-col gap-1.5 rounded-lg border border-foreground/12 p-3.5">
				<div className="flex items-center justify-between">
					<span className="text-12 text-muted-foreground">
						Sui address
					</span>
					<CopyText value={address} label="Copy" />
				</div>
				<span
					className="font-mono text-13 break-all"
					data-testid="create-review-address"
				>
					{address}
				</span>
			</div>

			<Divider />

			{error && (
				<Notice tone="error" testId="create-error">
					{error}
				</Notice>
			)}

			<div className="flex items-center justify-between gap-3">
				<Button
					type="button"
					variant="ghost"
					onClick={onBack}
					disabled={creating}
					className={disabledButton}
					data-testid="create-back"
				>
					<ArrowLeft />
					Back
				</Button>
				<Button
					type="button"
					onClick={onCreate}
					disabled={creating}
					className={disabledButton}
					data-testid="create-submit"
				>
					{creating
						? 'Creating multisig…'
						: error
							? 'Try again'
							: 'Create multisig'}
				</Button>
			</div>
		</div>
	);
}

function Summary({
	label,
	children,
	className,
}: {
	label: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				'flex min-w-0 flex-col gap-0.5',
				className,
			)}
		>
			<dt className="text-12 text-muted-foreground">
				{label}
			</dt>
			<dd className="text-14 font-medium">{children}</dd>
		</div>
	);
}
