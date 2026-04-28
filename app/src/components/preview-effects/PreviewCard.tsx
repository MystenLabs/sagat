// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { type ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { ObjectLink } from './ObjectLink';

type HeaderProps = {
	children?: ReactNode;
};
type RootProps = {
	children: ReactNode;
	className?: string;
};

type BodyProps = {
	children: ReactNode;
};

type FooterProps = {
	children?: ReactNode;
};

// eslint-disable-next-line react-refresh/only-export-components
function Root({ children, className }: RootProps) {
	return (
		<div
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
// eslint-disable-next-line react-refresh/only-export-components
function Footer({
	children,
	owner,
}: FooterProps & {
	owner?: SuiClientTypes.ObjectOwner | string;
}) {
	return (
		<div className="mt-auto bg-surface px-3 py-2 text-xs text-muted-foreground border-t">
			{children}
			{owner && (
				<div className="flex items-center justify-between gap-2">
					<span>Owner</span>
					<div className="flex items-center gap-1 min-w-0">
						{typeof owner === 'string' ? (
							<ObjectLink
								owner={{
									$kind: 'AddressOwner',
									AddressOwner: owner,
								}}
							/>
						) : (
							<ObjectLink owner={owner} />
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export const PreviewCard = {
	Root,
	Header,
	Body,
	Footer,
};
