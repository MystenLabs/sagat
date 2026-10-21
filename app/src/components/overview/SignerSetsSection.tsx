// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	Account,
	SignerSetWithMembers,
} from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';
import { Users } from 'lucide-react';

import { Alert } from '@/components/ui/Alert';
import { Label } from '@/components/ui/label';
import {
	getAliasWarnings,
	signerSetName,
	signerSetRole,
	validSignerSets,
	type AliasWarning,
	type SignerSetRole,
} from '@/lib/signerSets';

import { MembersList } from '../invitations/MembersList';
import { CopyButton } from '../ui/CopyButton';

const ROLE_LABELS: Record<
	Exclude<SignerSetRole, 'signing'>,
	string
> = {
	draft: 'Draft',
	inviting: 'Inviting',
	abandoned: 'Abandoned',
	inactive: 'Not valid on any network',
};

/**
 * What the chain says about who controls the account, when it is more
 * than one signer set or the networks disagree. Divergence is shown, not
 * hidden.
 */
export function AliasWarnings({
	account,
}: {
	account: Pick<Account, 'signerSets' | 'aliases'>;
}) {
	const warnings = getAliasWarnings(account);
	const severalValid = account.aliases.some(
		({ network }) =>
			validSignerSets(account, network).length > 1,
	);
	if (warnings.length === 0 && !severalValid) return null;

	const nameOf = (address: string) => {
		const signerSet = account.signerSets.find(
			(s) => s.address === address,
		);
		return signerSet
			? signerSetName(signerSet)
			: formatAddress(address);
	};

	return (
		<div className="space-y-2">
			{warnings.map((warning) => (
				<Alert key={warningKey(warning)} variant="warning">
					<div
						data-testid="alias-warning"
						data-kind={warning.kind}
					>
						{warning.kind === 'networks-disagree' ? (
							<>
								<p className="font-medium">
									Networks disagree on who controls this
									account
								</p>
								<ul className="mt-1">
									{warning.aliasSets.map(
										({ network, addresses }) => (
											<li key={network}>
												{network}:{' '}
												{addresses.map(nameOf).join(', ') ||
													'nobody'}
											</li>
										),
									)}
								</ul>
							</>
						) : (
							<>
								<p className="font-medium break-all">
									Unknown alias {warning.address} on{' '}
									{warning.network}
								</p>
								<p className="mt-1">
									It can sign for the account there, and is
									not one of its signer sets.
								</p>
							</>
						)}
					</div>
				</Alert>
			))}
			{severalValid && (
				<Alert variant="info">
					<span data-testid="several-signer-sets-note">
						Each valid signer set can sign for the account
						on its own, so the account is as secure as its
						weakest set.
					</span>
				</Alert>
			)}
		</div>
	);
}

function warningKey(warning: AliasWarning) {
	return warning.kind === 'networks-disagree'
		? warning.kind
		: `${warning.kind}:${warning.network}:${warning.address}`;
}

/**
 * Every signer set of the account: those that can sign first, then
 * drafts, abandoned and retired sets, which are shown as such.
 */
export function SignerSetsSection({
	signerSets,
	network,
}: {
	signerSets: SignerSetWithMembers[];
	network: string;
}) {
	const signing = signerSets.filter(
		(s) => signerSetRole(s) === 'signing',
	);
	const others = signerSets.filter(
		(s) => signerSetRole(s) !== 'signing',
	);

	return (
		<div className="bg-card border rounded-lg p-6">
			<h2 className="text-lg font-semibold mb-4 flex items-center">
				<Users className="w-5 h-5 mr-2" />
				Signer Sets ({signerSets.length})
			</h2>
			<div className="space-y-4">
				{signing.map((signerSet) => (
					<SignerSetCard
						key={signerSet.address}
						signerSet={signerSet}
						network={network}
					/>
				))}
				{others.length > 0 && (
					<>
						<p className="text-sm text-muted-foreground pt-2">
							Not signing: drafts, abandoned sets and sets
							that are not valid on any network cannot sign
							for the account.
						</p>
						{others.map((signerSet) => (
							<SignerSetCard
								key={signerSet.address}
								signerSet={signerSet}
								network={network}
							/>
						))}
					</>
				)}
			</div>
		</div>
	);
}

function SignerSetCard({
	signerSet,
	network,
}: {
	signerSet: SignerSetWithMembers;
	network: string;
}) {
	const role = signerSetRole(signerSet);
	const isSigning = role === 'signing';
	const notHere =
		isSigning &&
		!signerSet.validOn.some((n) => n === network);

	return (
		<div
			className={`border rounded-lg p-4 ${isSigning ? '' : 'bg-surface'}`}
			data-testid="signer-set"
			data-address={signerSet.address}
			data-role={role}
			data-valid-on={signerSet.validOn.join(',')}
		>
			<div className="flex flex-wrap items-center gap-2 mb-1">
				<h3 className="font-medium">
					{signerSetName(signerSet)}
				</h3>
				{isSigning ? (
					<Label variant="success" size="sm">
						Valid on {signerSet.validOn.join(', ')}
					</Label>
				) : (
					<Label variant="neutral" size="sm">
						{ROLE_LABELS[role]}
					</Label>
				)}
				{notHere && (
					<Label variant="warning" size="sm">
						Not valid on {network}
					</Label>
				)}
			</div>
			<div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
				<span className="font-mono">
					{formatAddress(signerSet.address)}
				</span>
				<CopyButton value={signerSet.address} size="xs" />
			</div>
			<p
				className="text-sm text-foreground mb-3"
				data-testid="signer-set-threshold"
				data-threshold={signerSet.threshold}
				data-total-weight={signerSet.totalWeight}
			>
				{signerSet.threshold} of {signerSet.totalWeight}{' '}
				weight required
			</p>
			{isSigning ? (
				<div className="space-y-2">
					<MembersList members={signerSet.members} />
				</div>
			) : (
				<details>
					<summary className="text-sm text-muted-foreground cursor-pointer">
						Members ({signerSet.members.length})
					</summary>
					<div className="space-y-2 mt-2">
						<MembersList members={signerSet.members} />
					</div>
				</details>
			)}
		</div>
	);
}
