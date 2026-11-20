// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '@/content';
import { useNetwork } from '@/contexts/NetworkContext';
import { useRetryNodeReads } from '@/hooks/useAliasSets';
import { type SuiNetwork } from '@/lib/network';
import { signersUncheckedLine } from '@/lib/signers-refused';

import { Alert } from '../ui/Alert';
import { Button } from '../ui/button';

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
				<Button
					variant="link"
					size="xs"
					onClick={retry}
					disabled={retrying}
					className="h-auto border-0 px-0 text-13 text-inherit underline hover:no-underline"
					data-testid={`${testId}-retry`}
				>
					{retrying
						? content.common.states.retrying
						: content.common.actions.tryAgain}
				</Button>
			</div>
		</Alert>
	);
}
