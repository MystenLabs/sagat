// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { content } from '@/content';
import { useNetwork } from '@/contexts/NetworkContext';
import { networkLabel } from '@/lib/network';
import { type PodChecks } from '@/lib/types';

import { Alert } from '../ui/Alert';
import { SignersRefused } from './SignersRefused';
import { SignersUnchecked } from './SignersUnchecked';

const COPY = content.common;

/** The pod's address (`children`) once both signers checks pass, else the reason. */
export function CheckedAddress({
	pod,
	testIdPrefix,
	children,
}: {
	pod: PodChecks;
	testIdPrefix: string;
	children: ReactNode;
}) {
	const { network } = useNetwork();
	if (pod.refused)
		return (
			<SignersRefused
				rule={pod.refused}
				testId={`${testIdPrefix}-refused`}
			/>
		);
	if (pod.acting.state === 'unchecked')
		return (
			<SignersUnchecked
				testId={`${testIdPrefix}-unchecked`}
			/>
		);
	if (pod.acting.state === 'checking')
		return (
			<p
				className="text-13 text-muted-foreground"
				data-testid={`${testIdPrefix}-checking`}
			>
				{COPY.states.checkingSigners}
			</p>
		);
	return (
		<>
			{pod.acting.unidentified.length > 0 && (
				<Alert
					variant="warning"
					data-testid={`${testIdPrefix}-other-signer-sets`}
				>
					<div className="font-medium">
						{COPY.otherSignerSets.title}
					</div>
					<div>
						{COPY.otherSignerSets.body(
							networkLabel(network),
						)}
					</div>
				</Alert>
			)}
			{children}
		</>
	);
}
