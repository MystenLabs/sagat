// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '@/content';
import { type OtherSignerSetRow } from '@/lib/signer-sets';

import {
	tableClass,
	tableHeadRowClass,
	tableRowClass,
} from '../ui/table';
import { FoldedRow } from './FoldedRow';
import {
	OpenPodLink,
	SignerSetAddress,
} from './SignerSetAddress';

const COPY = content.signers.otherSignerSets;

/** The aliases no acting set makes up. */
export function OtherSignerSetsCard({
	rows,
	network,
}: {
	rows: OtherSignerSetRow[];
	network: string;
}) {
	return (
		<FoldedRow
			label={COPY.title}
			count={rows.length}
			testId="other-signer-sets"
			card
		>
			<p className="text-13">{COPY.body(network)}</p>
			<OtherSignerSetsTable rows={rows} />
		</FoldedRow>
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
