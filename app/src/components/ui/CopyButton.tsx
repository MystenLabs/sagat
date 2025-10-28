// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Check, Copy } from 'lucide-react';

import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { cn } from '../../lib/utils';
import { Button } from './button';

interface CopyButtonProps {
	value: string;
	className?: string;
	variant?: 'default' | 'ghost' | 'outline';
	size?: 'default' | 'sm' | 'xs';
	successMessage?: string;
}

export function CopyButton({
	value,
	className,
	variant = 'ghost',
	size = 'xs',
	successMessage,
}: CopyButtonProps) {
	const { copied, copy } =
		useCopyToClipboard(successMessage);

	const sizeClasses = {
		default: 'p-1.5',
		sm: 'p-1',
		xs: 'p-0.5',
	};

	const iconSizes = {
		default: 'w-3.5 h-3.5',
		sm: 'w-3 h-3',
		xs: 'w-2.5 h-2.5',
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
					? 'Copied to clipboard!'
					: 'Copy to clipboard'
			}
		>
			{copied ? (
				<Check
					className={cn(iconSizes[size], 'text-green-600')}
				/>
			) : (
				<Copy className={iconSizes[size]} />
			)}
		</Button>
	);
}
