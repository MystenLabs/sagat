// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ComponentProps, type ReactNode } from 'react';

import { cn } from '../../lib/utils';

type HeaderProps = {
	children?: ReactNode;
};
type RootProps = ComponentProps<'div'>;

type BodyProps = {
	children: ReactNode;
};

// eslint-disable-next-line react-refresh/only-export-components
function Root({
	children,
	className,
	...props
}: RootProps) {
	return (
		<div
			{...props}
			className={cn(
				'bg-card border flex flex-col rounded-lg overflow-hidden',
				className,
			)}
		>
			{children}
		</div>
	);
}

// eslint-disable-next-line react-refresh/only-export-components
function Body({ children }: BodyProps) {
	return <div className="p-3">{children}</div>;
}

// eslint-disable-next-line react-refresh/only-export-components
function Header({ children }: HeaderProps) {
	return (
		<div className="bg-surface px-3 py-2 text-sm border-b">
			{children}
		</div>
	);
}

export const PreviewCard = {
	Root,
	Header,
	Body,
};
