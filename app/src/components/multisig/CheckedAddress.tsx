// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { content } from '@/content';
import { useNetwork } from '@/contexts/NetworkContext';
import { useRereadPodAliasSet } from '@/hooks/useAliasSets';
import { networkLabel } from '@/lib/network';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { Alert } from '../ui/Alert';
import { SignersRefused } from './SignersRefused';
import { SignersUnchecked } from './SignersUnchecked';

const COPY = content.common;

/** The pod's address (`children`) once both signers checks pass, else the reason; reads the alias set again behind it on open. */
export function CheckedAddress({
	pod,
	testIdPrefix,
	children,
}: {
	pod: MultisigWithMembersForPublicKey;
	testIdPrefix: string;
	children: ReactNode;
}) {
	const { network } = useNetwork();
	useRereadPodAliasSet(pod.address, {
		enabled:
			pod.refused !== 'signers' &&
			pod.refused !== 'notSigner',
	});
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
