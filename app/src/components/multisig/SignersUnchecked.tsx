// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '@/content';
import { useNetwork } from '@/contexts/NetworkContext';
import { useRetryNodeReads } from '@/hooks/useAliasSets';
import { type SuiNetwork } from '@/lib/network';
import { signersUncheckedLine } from '@/lib/signers-refused';

import { Alert } from '../ui/Alert';
import { InlineRetry } from '../ui/inline-retry';

/** The pod's alias set couldn't be read on a network, with a way to read it again. */
export function SignersUnchecked({
	network,
	testId,
	className,
}: {
	/** The network whose alias set couldn't be read; the selected one by default. */
	network?: SuiNetwork;
	testId: string;
	className?: string;
}) {
	const { network: selected } = useNetwork();
	const { retry, retrying } = useRetryNodeReads();
	return (
		<Alert
			variant="warning"
			className={className}
			data-testid={testId}
		>
			<div className="font-medium">
				{content.common.signersUnchecked.title}
			</div>
			<div>
				{signersUncheckedLine(network ?? selected)}{' '}
				<InlineRetry
					onRetry={retry}
					retrying={retrying}
					testId={`${testId}-retry`}
				/>
			</div>
		</Alert>
	);
}
