// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import { Check } from 'lucide-react';
import { type ReactNode } from 'react';

import {
	cardClass,
	CardHeading,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
	CopyText,
	HelpAccordion,
	NumberedSteps,
	SummaryRow,
} from '@/components/wizard/parts';
import { content } from '@/content';
import { joinList } from '@/lib/create-multisig';
import { thresholdLabel } from '@/lib/threshold';
import { cn } from '@/lib/utils';

const FIELDS = content.common.fields;
const COPY = content.createMultisig;

/** "3", or "3 (+1 incomplete)". */
function signersLabel(signers: number, incomplete: number) {
	return incomplete
		? COPY.preview.signersIncomplete(signers, incomplete)
		: signers;
}

/**
 * The preview's numbers in one line, shown under the stepper while the
 * preview card sits below the form.
 */
export function PreviewStrip({
	signers,
	incomplete,
	totalWeight,
	threshold,
	address,
	className,
}: {
	signers: number;
	incomplete: number;
	totalWeight: number;
	threshold: number;
	address: string | null;
	className?: string;
}) {
	return (
		<dl
			className={cn(
				'flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted px-3 py-2 text-12',
				className,
			)}
			data-testid="create-preview-strip"
		>
			<StripStat label={FIELDS.signers}>
				{signersLabel(signers, incomplete)}
			</StripStat>
			<StripStat label={FIELDS.totalWeight}>
				{totalWeight}
			</StripStat>
			<StripStat label={FIELDS.threshold}>
				{thresholdLabel({ threshold, totalWeight })}
			</StripStat>
			{address && (
				<StripStat label={FIELDS.address}>
					<span className="font-mono">
						{formatAddress(address)}
					</span>
				</StripStat>
			)}
		</dl>
	);
}

function StripStat({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center gap-1.5">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="font-medium">{children}</dd>
		</div>
	);
}

/** Steps 1 and 2: what the multisig will look like so far. */
export function PreviewCard({
	name,
	setUp,
	signers,
	incomplete,
	totalWeight,
	threshold,
	address,
	addressMessage,
}: {
	name: string;
	/** False until the signers step has been opened. */
	setUp: boolean;
	signers: number;
	incomplete: number;
	totalWeight: number;
	threshold: number;
	address: string | null;
	addressMessage: string | null;
}) {
	const muted = 'text-muted-foreground/70';
	return (
		<section
			className={cn(cardClass, 'gap-2 p-6')}
			aria-labelledby="create-preview-title"
			data-testid="create-preview"
		>
			<CardHeading
				id="create-preview-title"
				title={COPY.preview.title}
			/>
			<Separator />
			<dl className="flex flex-col gap-1">
				<SummaryRow label={COPY.fields.name}>
					<span
						className={cn(
							'text-13 break-all',
							!name.trim() && 'text-muted-foreground',
						)}
						data-testid="create-preview-name"
					>
						{name.trim() || COPY.preview.notSet}
					</span>
				</SummaryRow>
				<SummaryRow label={FIELDS.signers}>
					<span
						className={cn('text-12', !setUp && muted)}
						data-testid="create-preview-signers"
					>
						{setUp ? signersLabel(signers, incomplete) : 0}
					</span>
				</SummaryRow>
				<SummaryRow label={FIELDS.totalWeight}>
					<span className={cn('text-12', !setUp && muted)}>
						{setUp ? totalWeight : 0}
					</span>
				</SummaryRow>
				<SummaryRow label={FIELDS.threshold}>
					{setUp ? (
						<span
							className="text-12"
							data-testid="create-preview-threshold"
						>
							{thresholdLabel({ threshold, totalWeight })}
						</span>
					) : (
						<span className={cn('text-13', muted)}>
							{COPY.preview.notSet}
						</span>
					)}
				</SummaryRow>
			</dl>
			<Separator />
			<div className="flex flex-col gap-1.5 pt-1">
				<span className="text-13 text-muted-foreground">
					{FIELDS.suiAddress}
				</span>
				{setUp && address ? (
					<>
						<div className="flex flex-col gap-2 rounded-md bg-muted p-3">
							<span
								className="font-mono text-12 leading-normal break-all"
								data-testid="create-preview-address"
							>
								{address}
							</span>
							<CopyText
								value={address}
								label={content.common.actions.copyAddress}
							/>
						</div>
						<span className="flex items-center gap-1.5 text-12 text-success-foreground">
							<Check className="size-3" />
							{COPY.preview.live}
						</span>
					</>
				) : (
					<p
						className="rounded-md border border-dashed border-foreground/15 p-3 text-12 leading-normal text-muted-foreground"
						data-testid="create-preview-address-message"
					>
						{(setUp && addressMessage) || COPY.emptyAddress}
					</p>
				)}
			</div>
		</section>
	);
}

/** Steps 1 and 2: four short answers, one open at a time. */
export function HelpCard() {
	return (
		<HelpAccordion items={COPY.help} testId="create-help" />
	);
}

/** Step 3: what creating sets in motion. */
export function NextStepsCard({
	name,
	invited,
	threshold,
	totalWeight,
	isTestMode,
}: {
	name: string;
	invited: string[];
	threshold: number;
	totalWeight: number;
	isTestMode: boolean;
}) {
	const items = [
		{
			title: COPY.nextSteps.createdTitle,
			body: COPY.nextSteps.createdBody(name),
		},
		{
			title: COPY.nextSteps.acceptTitle,
			body: COPY.nextSteps.acceptBody(
				joinList(invited, 'and'),
			),
		},
		{
			title: COPY.nextSteps.fundTitle,
			body: isTestMode
				? COPY.nextSteps.fundBodyTest
				: COPY.nextSteps.fundBody(threshold, totalWeight),
		},
	];
	return (
		<section
			className={cn(cardClass, 'gap-4 p-6')}
			aria-labelledby="create-next-steps-title"
			data-testid="create-next-steps"
		>
			<CardHeading
				id="create-next-steps-title"
				title={content.common.whatHappensNext}
			/>
			<Separator />
			<NumberedSteps items={items} />
		</section>
	);
}
