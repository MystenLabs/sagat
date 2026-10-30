// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Check, Copy } from 'lucide-react';

import { content } from '@/content';

import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { cn } from '../../lib/utils';
import { Button } from './button';

interface CopyButtonProps {
	value: string;
	className?: string;
	variant?: 'default' | 'ghost' | 'outline';
	size?: 'default' | 'sm' | 'xs' | 'inline';
	successMessage?: string;
	'data-testid'?: string;
}

export function CopyButton({
	value,
	className,
	variant = 'ghost',
	size = 'xs',
	successMessage,
	...rest
}: CopyButtonProps) {
	const { copied, copy } =
		useCopyToClipboard(successMessage);

	const sizeClasses = {
		default: 'p-1.5',
		sm: 'p-1',
		xs: 'p-0.5',
		// A 16px box with a 12px icon, for an address in running text.
		// The icon's own `size-3` keeps the button's default
		// `[&_svg:not([class*='size-'])]:size-4` rule from applying, so
		// no `!` override is needed.
		inline: 'size-4 shrink-0 text-muted-foreground',
	};

	const iconSizes = {
		default: 'w-3.5 h-3.5',
		sm: 'w-3 h-3',
		xs: 'w-2.5 h-2.5',
		inline: 'size-3',
	};

	return (
		<Button
			variant={variant}
			size="icon"
			onClick={(e) => {
				e.stopPropagation();
				copy(value);
			}}
			className={cn(sizeClasses[size], className)}
			title={
				copied
					? content.common.copied
					: content.shell.controls.copyToClipboard
			}
			{...rest}
		>
			{copied ? (
				<Check
					className={cn(
						iconSizes[size],
						'text-success-foreground',
					)}
				/>
			) : (
				<Copy className={iconSizes[size]} />
			)}
		</Button>
	);
}
