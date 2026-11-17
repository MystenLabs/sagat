// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '@/content';

import { Alert } from '../ui/Alert';

/** Why a pod's signers failed a check, in place of what they would show. */
export function SignersRefused({
	rule,
	testId,
	className,
}: {
	rule: keyof typeof content.common.signersRefused;
	testId: string;
	className?: string;
}) {
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
			<div>{content.common.signersRefused[rule]}</div>
		</Alert>
	);
}
