// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '@/content';
import { useNetwork } from '@/contexts/NetworkContext';
import {
	signersRefusedLine,
	type SignersRefusedRule,
} from '@/lib/signers-refused';

import { Alert } from '../ui/Alert';

/** Why a pod's signers failed a check, in place of what they would show. */
export function SignersRefused({
	rule,
	testId,
	className,
}: {
	rule: SignersRefusedRule;
	testId: string;
	className?: string;
}) {
	const { network } = useNetwork();
	return (
		<Alert
			variant="error"
			className={className}
			data-testid={testId}
			data-rule={rule}
		>
			<div className="font-medium">
				{content.common.signersRefusedTitle}
			</div>
			<div>{signersRefusedLine(rule, network)}</div>
		</Alert>
	);
}
