// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { content } from '@/content';
import { type OtherSignerSetRow } from '@/lib/signer-sets';
import { cn } from '@/lib/utils';

import { cardClass } from '../ui/card';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '../ui/collapsible';
import {
	tableClass,
	tableHeadRowClass,
	tableRowClass,
} from '../ui/table';
import {
	OpenPodLink,
	SignerSetAddress,
} from './SignerSetAddress';

const COPY = content.signers.otherSignerSets;

/** The aliases no acting set makes up. */
export function OtherSignerSetsCard({
	rows,
	network,
	className,
}: {
	rows: OtherSignerSetRow[];
	network: string;
	className?: string;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			render={<section />}
			className={cn(cardClass, className)}
			aria-labelledby="other-signer-sets-title"
			data-testid="other-signer-sets"
		>
			<h2
				id="other-signer-sets-title"
				className="text-16 font-medium"
			>
				<CollapsibleTrigger
					className="flex w-full cursor-pointer items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
					data-testid="other-signer-sets-toggle"
				>
					{COPY.title}
					<span
						className="text-12 font-normal text-muted-foreground"
						data-testid="other-signer-sets-count"
					>
						{rows.length}
					</span>
					<ChevronDown
						aria-hidden
						className={cn(
							'ml-auto size-4 transition-transform',
							open && 'rotate-180',
						)}
					/>
				</CollapsibleTrigger>
			</h2>
			<CollapsibleContent className="flex flex-col gap-3">
				<p className="text-13">{COPY.body(network)}</p>
				<OtherSignerSetsTable rows={rows} />
			</CollapsibleContent>
		</Collapsible>
	);
}

export function OtherSignerSetsTable({
	rows,
}: {
	rows: OtherSignerSetRow[];
}) {
	return (
		<table className={tableClass}>
			<thead>
				<tr className={tableHeadRowClass}>
					<th className="px-3">{COPY.columns.signerSet}</th>
					<th className="w-32 px-3 sm:w-60">
						{COPY.columns.signers}
					</th>
				</tr>
			</thead>
			<tbody>
				{rows.map(({ address, pod }) => (
					<tr
						key={address}
						className={tableRowClass}
						data-testid="other-signer-set"
						data-address={address}
						data-pod={pod ? 'yes' : 'no'}
					>
						<td className="px-3 py-2.5">
							<div className="flex min-w-0 flex-col gap-0.5">
								{pod?.name && (
									<span
										className="truncate font-medium"
										data-testid="other-signer-set-name"
									>
										{pod.name}
									</span>
								)}
								<SignerSetAddress address={address} />
								<span className="text-12 text-muted-foreground">
									{pod
										? COPY.createdInPods
										: COPY.addedOutside}
								</span>
							</div>
						</td>
						<td className="px-3 py-2.5">
							{pod ? (
								<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
									<div className="flex flex-col gap-0.5">
										<span>{pod.signers}</span>
										<span className="text-12 text-muted-foreground">
											{pod.threshold}
										</span>
									</div>
									<OpenPodLink address={pod.address} />
								</div>
							) : (
								<span className="text-muted-foreground">
									{COPY.noDetails}
								</span>
							)}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
