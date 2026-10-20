// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useGetMultisig } from '@/hooks/useGetMultisig';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

import { accountSetup } from '../multisig/account-setup';
import { CreatedBy } from '../multisig/CreatedBy';

interface OverviewTabContext {
	multisig: MultisigWithMembersForPublicKey;
}

/**
 * The account at a glance: its threshold against the signers' weight, how
 * many signers it has, and when and by whom it was created.
 */
export function OverviewTab() {
	const { multisig } =
		useOutletContext<OverviewTabContext>();
	const { currentAddress } = useApiAuth();
	const { data: details } = useGetMultisig(
		multisig.address,
	);
	const account = details ?? multisig;
	const setup = accountSetup({
		multisig: account,
		totalWeight:
			details?.totalWeight ?? multisig.totalWeight,
		currentAddress: currentAddress?.address,
	});

	return (
		<div className="@container flex flex-col gap-7">
			<dl
				className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl border bg-card p-5 sm:grid-cols-3 md:p-6 @3xl:flex @3xl:gap-8"
				data-testid="account-summary"
			>
				<Stat label="Threshold">
					<span
						data-testid="multisig-threshold"
						data-threshold={account.threshold}
						data-total-weight={setup.totalWeight}
					>
						{setup.threshold}
					</span>
				</Stat>
				<Stat label="Signers">{setup.signers}</Stat>
				<Stat label="Total weight">
					{setup.totalWeight}
				</Stat>
				<Stat label="Created">
					<span
						data-testid="account-created"
						data-created-at={setup.createdAt ?? undefined}
						className={cn(
							!setup.created && 'text-muted-foreground',
						)}
					>
						{setup.created ?? 'Unknown'}
					</span>
				</Stat>
				<Stat label="Created by">
					<CreatedBy creator={setup.creator} />
				</Stat>
			</dl>
		</div>
	);
}

/** A label over its value, as on the summary strip. */
function Stat({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1 @3xl:min-w-fit @3xl:flex-1">
			<dt className="text-13 whitespace-nowrap text-muted-foreground">
				{label}
			</dt>
			<dd className="flex min-w-0 text-16 font-medium whitespace-nowrap">
				{children}
			</dd>
		</div>
	);
}
