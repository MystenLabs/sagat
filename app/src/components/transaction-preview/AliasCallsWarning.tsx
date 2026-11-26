// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from 'react';

import { Alert } from '@/components/ui/Alert';
import { content } from '@/content';
import {
	networkLabel,
	type SuiNetwork,
} from '@/lib/network';
import {
	aliasCallsIn,
	enablesSignerChanges,
} from '@/lib/proposalUtils';

const COPY = content.transactionPreview.aliasCalls;

export function AliasCallsWarning({
	bytes,
	network,
	className,
}: {
	bytes: string;
	network: SuiNetwork;
	className?: string;
}) {
	const calls = useMemo(() => aliasCallsIn(bytes), [bytes]);
	if (calls.length === 0) return null;
	if (enablesSignerChanges(bytes))
		return (
			<Alert
				variant="info"
				className={className}
				data-testid="alias-calls-warning"
			>
				{COPY.enablesChanges(networkLabel(network))}
			</Alert>
		);
	const replaceAll = calls.some(
		(call) => call.function === 'replace_all',
	);
	return (
		<Alert
			variant="warning"
			className={className}
			data-testid="alias-calls-warning"
			data-replace-all={replaceAll}
		>
			{COPY.warning(networkLabel(network), replaceAll)}
		</Alert>
	);
}
