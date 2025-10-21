// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { CopyButton } from '@/components/ui/CopyButton';

export function FieldDisplay({
	label,
	value,
	copyable = true,
	copyMessage,
}: {
	label: string;
	value: string | number;
	copyable?: boolean;
	copyMessage?: string;
}) {
	return (
		<div className="space-y-1">
			<div className="text-sm font-medium text-gray-700">
				{label}
			</div>
			<div className="bg-gray-50 rounded-md text-sm font-mono p-3 break-all border flex items-center justify-between">
				<span>{value}</span>
				{copyable && typeof value === 'string' && (
					<CopyButton
						value={value}
						successMessage={copyMessage}
						size="sm"
					/>
				)}
			</div>
		</div>
	);
}
