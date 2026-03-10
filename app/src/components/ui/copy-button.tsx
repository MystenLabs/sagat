// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	cva,
	type VariantProps,
} from 'class-variance-authority';
import { Check, Copy } from 'lucide-react';

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { cn } from '@/lib/utils';

const copyButtonVariants = cva(
	'inline-flex items-center justify-center rounded transition-colors hover:bg-accent cursor-pointer',
	{
		variants: {
			size: {
				sm: 'p-0.5 [&_svg]:w-3 [&_svg]:h-3',
				md: 'p-1 [&_svg]:w-4 [&_svg]:h-4',
				lg: 'p-1.5 [&_svg]:w-5 [&_svg]:h-5',
			},
		},
		defaultVariants: {
			size: 'sm',
		},
	},
);

export function CopyButton({
	value,
	successMessage = 'Copied!',
	size,
	className,
}: {
	value: string;
	successMessage?: string;
	className?: string;
	size?: VariantProps<typeof copyButtonVariants>['size'];
} & VariantProps<typeof copyButtonVariants>) {
	const { copy, copied } =
		useCopyToClipboard(successMessage);

	return (
		<button
			onClick={() => copy(value)}
			className={cn(
				copyButtonVariants({ size }),
				className,
			)}
			title="Copy full digest"
		>
			{copied ? (
				<Check className="text-success-foreground" />
			) : (
				<Copy className="text-muted-foreground hover:text-foreground" />
			)}
		</button>
	);
}
