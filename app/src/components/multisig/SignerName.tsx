// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { CopyButton } from '@/components/ui/CopyButton';
import { content } from '@/content';
import { cn } from '@/lib/utils';

/**
 * Type per place the name shows. `inline` takes the surrounding text's
 * size and flows in it (the "Created by" values); `sm` is the invitation
 * review table; `md` the signers card and the create wizard's review.
 */
const SIZES = {
	inline: {
		display: 'inline-flex',
		gap: 'gap-1',
		label: '',
		address: '',
		bare: '',
		bareAddress: '',
		marker: '',
	},
	sm: {
		display: 'flex',
		gap: 'gap-1.5',
		label: 'text-13 font-medium',
		address: 'text-12 whitespace-nowrap',
		bare: 'text-12 whitespace-nowrap',
		bareAddress: '',
		marker: 'font-sans text-12 text-muted-foreground',
	},
	md: {
		display: 'flex',
		gap: 'gap-1.5',
		label: 'text-14 font-medium',
		address: 'text-11 text-muted-foreground',
		bare: 'text-14 font-medium',
		bareAddress: 'text-13',
		marker: 'text-muted-foreground',
	},
} as const;

const MARKERS = content.signers.markers;

/**
 * A signer's name over their short address when the key has a label;
 * the short address alone when it doesn't. A marker ("You", "(you)",
 * "Creator", "(external)") follows the first line, and `copy` adds a copy button
 * after the address.
 */
export function SignerName({
	label,
	address,
	marker = null,
	markerStyle = 'word',
	copy = false,
	size = 'md',
	wrap = false,
	labelTestId,
}: {
	label: string | null;
	address?: string;
	marker?: keyof typeof MARKERS | null;
	markerStyle?: 'word' | 'parens';
	copy?: boolean;
	size?: keyof typeof SIZES;
	/**
	 * Show the whole name, wrapped and at regular weight, instead of
	 * truncating it (the create wizard's review).
	 */
	wrap?: boolean;
	/** A test id on the label, for the member tables. */
	labelTestId?: string;
}) {
	const s = SIZES[size];
	// The space keeps "Alice (you)" readable as text; the gap spaces it.
	const markerText = marker && (
		<>
			{' '}
			<span className={cn('shrink-0', s.marker)}>
				{MARKERS[marker][markerStyle]}
			</span>
		</>
	);
	const copyButton = copy && address && (
		<CopyButton
			value={address}
			size="inline"
			successMessage={content.toasts.addressCopied}
		/>
	);

	if (!label)
		return (
			<span
				className={cn(
					'min-w-0 flex-wrap items-center',
					s.display,
					s.gap,
					s.bare,
				)}
			>
				{address ? (
					// The address and its copy button never split; only the
					// marker may wrap under them.
					<span
						className={cn(
							'inline-flex items-center whitespace-nowrap',
							s.gap,
						)}
					>
						<ShortAddress
							address={address}
							className={cn('font-mono', s.bareAddress)}
						/>
						{copyButton}
					</span>
				) : (
					<span
						className={cn(
							'truncate font-mono',
							s.bareAddress,
						)}
					>
						{content.signers.unknownKey}
					</span>
				)}
				{markerText}
			</span>
		);

	return (
		<span
			className={cn('min-w-0 flex-col gap-px', s.display)}
		>
			<span
				className={cn('flex min-w-0 items-center', s.gap)}
			>
				<span
					className={cn(
						s.label,
						wrap
							? 'min-w-0 font-normal break-words'
							: 'truncate',
					)}
					data-testid={labelTestId}
				>
					{label}
				</span>
				{markerText}
			</span>
			{address && (
				<span
					className={cn(
						'flex items-center gap-1 font-mono',
						s.address,
					)}
				>
					<ShortAddress address={address} />
					{copyButton}
				</span>
			)}
		</span>
	);
}
