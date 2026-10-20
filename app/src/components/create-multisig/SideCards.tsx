// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import { Check } from 'lucide-react';
import { type ReactNode } from 'react';

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { COPY, joinList } from '@/lib/create-multisig';
import { thresholdLabel } from '@/lib/threshold';
import { cn } from '@/lib/utils';

import { HELP } from './help';
import { CopyText, Divider } from './parts';

const card = 'rounded-xl border bg-card';

/** "3", or "3 (+1 incomplete)". */
function signersLabel(signers: number, incomplete: number) {
	return incomplete
		? `${signers} (+${incomplete} incomplete)`
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
			<StripStat label="Signers">
				{signersLabel(signers, incomplete)}
			</StripStat>
			<StripStat label="Total weight">
				{totalWeight}
			</StripStat>
			<StripStat label="Threshold">
				{thresholdLabel({ threshold, totalWeight })}
			</StripStat>
			{address && (
				<StripStat label="Address">
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
			className={cn(card, 'flex flex-col gap-2 p-6')}
			data-testid="create-preview"
		>
			<h2 className="text-16 font-medium">
				Multisig preview
			</h2>
			<Divider />
			<dl className="flex flex-col gap-1">
				<PreviewRow label="Name">
					<span
						className={cn(
							'text-13 break-all',
							!name.trim() && 'text-muted-foreground',
						)}
						data-testid="create-preview-name"
					>
						{name.trim() || 'Not set'}
					</span>
				</PreviewRow>
				<PreviewRow label="Signers">
					<span
						className={cn('text-12', !setUp && muted)}
						data-testid="create-preview-signers"
					>
						{setUp ? signersLabel(signers, incomplete) : 0}
					</span>
				</PreviewRow>
				<PreviewRow label="Total weight">
					<span className={cn('text-12', !setUp && muted)}>
						{setUp ? totalWeight : 0}
					</span>
				</PreviewRow>
				<PreviewRow label="Threshold">
					{setUp ? (
						<span
							className="text-12"
							data-testid="create-preview-threshold"
						>
							{thresholdLabel({ threshold, totalWeight })}
						</span>
					) : (
						<span className={cn('text-13', muted)}>
							Not set
						</span>
					)}
				</PreviewRow>
			</dl>
			<Divider />
			<div className="flex flex-col gap-1.5 pt-1">
				<span className="text-13 text-muted-foreground">
					Sui address
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
								label="Copy address"
							/>
						</div>
						<span className="flex items-center gap-1.5 text-12 text-success-foreground">
							<Check className="size-3" />
							Live preview of the current setup
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

function PreviewRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-5.5 items-center justify-between gap-4 py-0.5">
			<dt className="shrink-0 text-13 text-muted-foreground">
				{label}
			</dt>
			<dd className="min-w-0 text-right">{children}</dd>
		</div>
	);
}

/** Steps 1 and 2: four short answers, one open at a time. */
export function HelpCard() {
	return (
		<Accordion className={card} data-testid="create-help">
			{HELP.map((item) => (
				<AccordionItem key={item.id} value={item.id}>
					<AccordionTrigger className="items-center gap-3 rounded-none px-5 py-3 text-13 font-normal hover:no-underline focus-visible:ring-inset **:data-[slot=accordion-trigger-icon]:size-3.5">
						{item.question}
					</AccordionTrigger>
					<AccordionContent className="px-5 pb-3 text-13 leading-normal text-muted-foreground">
						{item.answer}
					</AccordionContent>
				</AccordionItem>
			))}
		</Accordion>
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
			title: 'The multisig is created',
			body: `${name} appears in your sidebar.`,
		},
		{
			title: 'Signers accept',
			body: `${joinList(invited, 'and')} will each get an invitation. They’ll see the multisig once they accept.`,
		},
		{
			title: 'Fund the multisig',
			body: isTestMode
				? 'Get test SUI from the Sui faucet and send it to the multisig’s Sui address. Test funds have no value, so it’s a safe way to try a proposal.'
				: `Send SUI and tokens to the multisig’s Sui address. Wait until every signer has accepted before you move real funds, so a wrong key is caught first. Moving them out needs approvals worth ${threshold} of the multisig’s ${totalWeight} weight.`,
		},
	];
	return (
		<section
			className={cn(card, 'flex flex-col gap-4 p-6')}
			data-testid="create-next-steps"
		>
			<h2 className="text-16 font-medium">
				What happens next
			</h2>
			<Divider />
			<ol className="flex flex-col gap-3">
				{items.map((item, i) => (
					<li key={item.title} className="flex gap-3">
						<span className="flex size-5.5 shrink-0 items-center justify-center rounded-full border border-foreground/15 text-11 leading-none text-foreground-secondary">
							{i + 1}
						</span>
						<div className="flex min-w-0 flex-col gap-0.5">
							<span className="text-14 font-medium">
								{item.title}
							</span>
							<p className="text-13 leading-normal text-muted-foreground">
								{item.body}
							</p>
						</div>
					</li>
				))}
			</ol>
		</section>
	);
}
