import { type ReactNode } from 'react';

import { cn } from '../../lib/utils';

interface EmptyStateProps {
	icon?: ReactNode;
	title: string;
	description?: string;
	action?: ReactNode;
	className?: string;
}

export function EmptyState({
	icon,
	title,
	description,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				'text-center py-12 bg-gray-50 rounded-lg',
				className,
			)}
		>
			{icon && <div className="mx-auto mb-4">{icon}</div>}
			<h3 className="text-lg font-medium text-gray-900 mb-2">
				{title}
			</h3>
			{description && (
				<p className="text-gray-500 mb-4">{description}</p>
			)}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}
