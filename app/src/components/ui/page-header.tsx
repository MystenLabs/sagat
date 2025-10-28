// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '../../lib/utils';

interface PageHeaderProps {
	title: string;
	description?: string;
	backLink?: string;
	backLabel?: string;
	action?: ReactNode;
	className?: string;
}

export function PageHeader({
	title,
	description,
	backLink,
	backLabel = 'Back',
	action,
	className,
}: PageHeaderProps) {
	return (
		<div className={cn('mb-8', className)}>
			{backLink && (
				<Link
					to={backLink}
					className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
				>
					<ArrowLeft className="w-4 h-4 mr-1" />
					{backLabel}
				</Link>
			)}
			<div className="flex justify-between items-start">
				<div>
					<h1 className="text-3xl font-bold">{title}</h1>
					{description && (
						<p className="text-gray-600 mt-1">
							{description}
						</p>
					)}
				</div>
				{action && <div>{action}</div>}
			</div>
		</div>
	);
}
