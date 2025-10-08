// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ObjectOwner } from '@mysten/sui/client';
import { type ReactNode } from 'react';

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
			className={`border flex flex-col  rounded-lg shadow overflow-hidden ${className}`}
		>
			{children}
		</div>
	);
}

// eslint-disable-next-line react-refresh/only-export-components
function Body({ children }: BodyProps) {
	return (
		<div className="p-3 overflow-x-auto">{children}</div>
	);
}

// eslint-disable-next-line react-refresh/only-export-components
function Header({ children }: HeaderProps) {
	return (
		<div className="bg-gray-100 py-3 px-2 text-sm overflow-x-auto break-words">
			{children}
		</div>
	);
}
// eslint-disable-next-line react-refresh/only-export-components
function Footer({
	children,
	owner,
}: FooterProps & { owner?: ObjectOwner }) {
	return (
		<div className="mt-auto bg-gray-100 py-3 px-2 text-sm overflow-x-auto break-words">
			{children}
			{owner && (
				<div className="flex items-center ">
					<div>Owner</div>
					<div className="col-span-3 text-right flex items-center gap-1 ml-auto">
						<ObjectLink owner={owner} />
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
