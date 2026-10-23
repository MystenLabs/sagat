// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	Divider,
	HelpAccordion,
	NumberedSteps,
	SummaryRow,
} from '@/components/wizard/parts';
import {
	networkLabel,
	type SuiNetwork,
} from '@/contexts/NetworkContext';
import { accountName } from '@/lib/account-name';
import { thresholdLabel } from '@/lib/threshold';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { HELP } from './help';

/** Steps 1 and 2: the account the proposal comes from. */
export function FromCard({
	multisig,
	network,
	yourWeight,
}: {
	multisig: MultisigWithMembersForPublicKey;
	network: SuiNetwork;
	yourWeight: number | null;
}) {
	const rows: [string, string][] = [
		['Account', accountName(multisig)],
		['Network', networkLabel(network)],
		['Threshold', thresholdLabel(multisig)],
		...(yourWeight != null
			? [
					['Your weight', String(yourWeight)] as [
						string,
						string,
					],
				]
			: []),
		['Gas', 'Paid by the account'],
	];
	return (
		<section
			className="flex flex-col gap-2 rounded-xl border bg-card p-6"
			data-testid="proposal-from-card"
		>
			<h2 className="text-16 font-medium">From</h2>
			<Divider />
			<dl className="flex flex-col gap-1">
				{rows.map(([label, value]) => (
					<SummaryRow key={label} label={label}>
						<span className="text-13 break-all">
							{value}
						</span>
					</SummaryRow>
				))}
			</dl>
		</section>
	);
}

/** Steps 1 and 2: four short answers, one open at a time. */
export function HelpCard() {
	return (
		<HelpAccordion items={HELP} testId="proposal-help" />
	);
}

/** Step 3: what proposing sets in motion. */
export function NextStepsCard({
	threshold,
	yourWeight,
}: {
	threshold: number;
	yourWeight: number | null;
}) {
	const items = [
		{
			title: 'Your wallet asks you to approve',
			body: 'Approve the request in your wallet. Nothing is created until you do.',
		},
		{
			title: 'The proposal is created',
			body:
				yourWeight != null
					? `It shows in Proposals with your signature, ${yourWeight} of the ${threshold} weight it needs.`
					: 'It shows in Proposals with your signature.',
		},
		{
			title: 'The other signers sign',
			body: `Once signatures reach ${threshold}, anyone can execute it.`,
		},
	];
	return (
		<section
			className="flex flex-col gap-4 rounded-xl border bg-card p-6"
			data-testid="proposal-next-steps"
		>
			<h2 className="text-16 font-medium">
				What happens next
			</h2>
			<Divider />
			<NumberedSteps items={items} />
		</section>
	);
}
