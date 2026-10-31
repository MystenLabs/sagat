// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	cardClass,
	CardHeading,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
	HelpAccordion,
	NumberedSteps,
	SummaryRow,
} from '@/components/wizard/parts';
import { content } from '@/content';
import { accountName } from '@/lib/account-name';
import {
	networkLabel,
	type SuiNetwork,
} from '@/lib/network';
import { thresholdLabel } from '@/lib/threshold';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

const FIELDS = content.common.fields;

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
	const copy = content.newProposal.from;
	const rows: [string, string][] = [
		[copy.account, accountName(multisig)],
		[FIELDS.network, networkLabel(network)],
		[FIELDS.threshold, thresholdLabel(multisig)],
		...(yourWeight != null
			? [
					[FIELDS.yourWeight, String(yourWeight)] as [
						string,
						string,
					],
				]
			: []),
		[FIELDS.gas, copy.gasPaidBy],
	];
	return (
		<section
			className={cn(cardClass, 'gap-2 p-6')}
			aria-labelledby="proposal-from-title"
			data-testid="proposal-from-card"
		>
			<CardHeading
				id="proposal-from-title"
				title={copy.title}
			/>
			<Separator />
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
		<HelpAccordion
			items={content.newProposal.help}
			testId="proposal-help"
		/>
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
	const copy = content.newProposal.nextSteps;
	const items = [
		{
			title: copy.approveTitle,
			body: copy.approveBody,
		},
		{
			title: copy.createdTitle,
			body:
				yourWeight != null
					? copy.createdBodyWithWeight(
							yourWeight,
							threshold,
						)
					: copy.createdBody,
		},
		{
			title: copy.signTitle,
			body: copy.signBody(threshold),
		},
	];
	return (
		<section
			className={cn(cardClass, 'gap-4 p-6')}
			aria-labelledby="proposal-next-steps-title"
			data-testid="proposal-next-steps"
		>
			<CardHeading
				id="proposal-next-steps-title"
				title={content.common.whatHappensNext}
			/>
			<Separator />
			<NumberedSteps items={items} />
		</section>
	);
}
