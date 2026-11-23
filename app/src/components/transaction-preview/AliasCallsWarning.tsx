// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { findAliasCalls } from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import { useMemo } from 'react';

import { Alert } from '@/components/ui/Alert';
import { content } from '@/content';
import {
	networkLabel,
	type SuiNetwork,
} from '@/lib/network';

const COPY = content.transactionPreview.aliasCalls;

// None for bytes that don't decode, which the preview reports itself.
function aliasCallsIn(bytes: string) {
	try {
		return findAliasCalls(
			Transaction.from(bytes).getData(),
		);
	} catch {
		return [];
	}
}

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
			{COPY.changesControl(networkLabel(network))}
			{replaceAll && <> {COPY.replaceAll}</>}
		</Alert>
	);
}
