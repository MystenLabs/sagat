// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
	useNetwork,
	type SuiNetwork,
} from '@/contexts/NetworkContext';
import { useNetworkOptions } from '@/hooks/useNetworkOptions';
import { cn } from '@/lib/utils';

const capitalize = (value: string) =>
	value.charAt(0).toUpperCase() + value.slice(1);

/** The card a tool's form sits in: fields stacked 20px apart. */
export function ToolCard({
	className,
	...props
}: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'flex flex-col gap-5 rounded-xl border bg-card p-6',
				className,
			)}
			{...props}
		/>
	);
}

/**
 * The network the tool talks to: the wallet kit's network, the one the
 * sidebar shows, with devnet on offer too since the tools work straight
 * against the chain.
 */
export function NetworkField() {
	const { network, setNetwork } = useNetwork();
	const options = useNetworkOptions('tools');

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor="tool-network" className="text-14">
				Network
			</Label>
			<Select
				value={network}
				onValueChange={(next) => {
					if (typeof next === 'string')
						setNetwork(next as SuiNetwork);
				}}
			>
				<SelectTrigger
					id="tool-network"
					className="w-60"
					data-testid="tool-network-button"
					data-network={network}
				>
					<span className="flex-1 text-left">
						{capitalize(network)}
					</span>
				</SelectTrigger>
				<SelectContent alignItemWithTrigger={false}>
					{options.map(({ value, enabled, hint }) => (
						<SelectItem
							key={value}
							value={value}
							disabled={!enabled}
						>
							{capitalize(value)}
							{hint && (
								<span className="ml-auto text-11 text-muted-foreground">
									{hint}
								</span>
							)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

/** A labelled mono textarea for pasted bytes, with an error line under it. */
export function BytesField({
	id,
	label,
	testId,
	placeholder,
	minHeight,
	value,
	onChange,
	readOnly,
	error,
	errorTestId,
}: {
	id: string;
	label: string;
	testId: string;
	placeholder: string;
	/** A `min-h-*` class for the textarea. */
	minHeight: string;
	value: string;
	onChange: (value: string) => void;
	readOnly?: boolean;
	error?: string;
	errorTestId?: string;
}) {
	const errorId = `${id}-error`;
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id} className="text-14">
				{label}
			</Label>
			<Textarea
				id={id}
				data-testid={testId}
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				readOnly={readOnly}
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? errorId : undefined}
				className={cn('font-mono md:text-12', minHeight)}
			/>
			{error && (
				<p
					id={errorId}
					className="text-13 text-error-foreground"
					data-testid={errorTestId}
				>
					{error}
				</p>
			)}
		</div>
	);
}

/** A labelled value too long to shorten: shown in full, mono. */
export function ReadOnlyField({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-14 font-medium">{label}</span>
			<div className="rounded-md bg-muted px-3 py-2.5 font-mono text-12 break-all">
				{value}
			</div>
		</div>
	);
}

/** The card's last row: an optional note on the left, buttons on the right. */
export function ToolActions({
	note,
	noteTestId,
	children,
}: {
	note?: ReactNode;
	noteTestId?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center gap-3">
			{note && (
				<p
					className="min-w-0 flex-1 basis-64 text-13 text-muted-foreground"
					data-testid={noteTestId}
				>
					{note}
				</p>
			)}
			<div className="ml-auto flex flex-wrap justify-end gap-2">
				{children}
			</div>
		</div>
	);
}
