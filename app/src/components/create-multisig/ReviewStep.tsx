// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft, Pen } from 'lucide-react';

import { SignerName } from '@/components/multisig/SignerName';
import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import {
	signerName,
	type SignerDraft,
} from '@/lib/create-multisig';
import { validatePublicKey } from '@/lib/sui-utils';
import { thresholdLabel } from '@/lib/threshold';
import { cn } from '@/lib/utils';

import {
	CopyText,
	Divider,
	Notice,
	SectionHeading,
	StepFooter,
} from './parts';

/** Step 3: everything at a glance, then create. */
export function ReviewStep({
	name,
	signers,
	threshold,
	totalWeight,
	address,
	creating,
	error,
	onEditName,
	onEditSigners,
	onBack,
	onCreate,
	onCancel,
}: {
	name: string;
	signers: SignerDraft[];
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
	onCancel: () => void;
}) {
	// Shared by the table and the list, which render the same rows.
	const rows = signers.map((signer, i) => {
		const key = signer.key.trim();
		return {
			id: signer.id,
			position: i + 1,
			// "Maya", "You", "Daniel" or "Signer 3"; a named creator also gets
			// "(you)".
			name: signerName(signer, i),
			isYou: signer.isCreator && !!signer.label.trim(),
			key,
			address: validatePublicKey(key).address,
			weight: signer.weight,
		};
	});

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
				<Stat
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
				</Stat>
				<Stat label="Signers">{signers.length}</Stat>
				<Stat label="Total weight">{totalWeight}</Stat>
				<Stat label="Threshold">
					{thresholdLabel({ threshold, totalWeight })}
				</Stat>
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
				{/* A table in a wide card; a list of signers in a narrow one. */}
				<div className="hidden overflow-x-auto rounded-lg border border-foreground/8 bg-card @xl/card:block">
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
							{rows.map((row) => (
								<tr
									key={row.id}
									className="border-b last:border-b-0"
									data-testid="create-review-signer"
								>
									<td className="py-3 pl-3 align-middle text-12 text-muted-foreground">
										{row.position}
									</td>
									<td className="py-3 pr-3 align-middle">
										<SignerName
											label={row.name}
											address={row.address}
											marker={row.isYou ? 'you' : null}
											markerStyle="parens"
											wrap
											labelTestId="create-review-signer-name"
										/>
									</td>
									<td className="py-3 pr-3 align-middle font-mono text-11 break-all text-foreground-secondary">
										{row.key}
									</td>
									<td className="py-3 pr-3 text-right align-middle text-13">
										{row.weight}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<ul
					className="divide-y divide-foreground/8 rounded-lg border border-foreground/8 bg-card @xl/card:hidden"
					data-testid="create-review-list"
				>
					{rows.map((row) => (
						<li
							key={row.id}
							className="flex items-center gap-3 px-3 py-2.5"
							data-testid="create-review-item"
						>
							<span className="w-4 shrink-0 text-12 text-muted-foreground">
								{row.position}
							</span>
							<div className="flex min-w-0 flex-1 flex-col">
								<SignerName
									label={row.name}
									address={row.address}
									marker={row.isYou ? 'you' : null}
									markerStyle="parens"
									wrap
								/>
								<span className="truncate font-mono text-11 text-foreground-secondary">
									{row.key}
								</span>
							</div>
							<span className="shrink-0 text-13">
								{row.weight}
							</span>
						</li>
					))}
				</ul>
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

			<StepFooter
				onCancel={onCancel}
				cancelDisabled={creating}
				back={
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
				}
				primary={
					<Button
						type="button"
						onClick={onCreate}
						disabled={creating}
						className={cn(
							disabledButton,
							'w-full sm:w-auto',
						)}
						data-testid="create-submit"
					>
						{creating
							? 'Creating multisig…'
							: error
								? 'Try again'
								: 'Create multisig'}
					</Button>
				}
			/>
		</div>
	);
}
