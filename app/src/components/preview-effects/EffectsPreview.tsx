// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { messageWithIntent } from '@mysten/sui/cryptography';
import { fromBase64, toHex } from '@mysten/sui/utils';
import { blake2b } from '@noble/hashes/blake2.js';
import { useMemo, useState } from 'react';

import { Label } from '@/components/ui/label';

import { cn } from '../../lib/utils';
import { Alert } from '../ui/Alert';
import { Textarea } from '../ui/textarea';
import { BalanceChanges } from './partials/BalanceChanges';
import { Events } from './partials/Events';
import { ObjectChanges } from './partials/ObjectChanges';
import { Overview } from './partials/Overview';
import { Transactions } from './partials/Transactions';

export function EffectsPreview({
	output,
	bytes,
}: {
	output: SuiClientTypes.SimulateTransactionResult<{
		effects: true;
		balanceChanges: true;
		events: true;
		transaction: true;
		objectTypes: true;
	}>;
	bytes?: string;
}) {
	const [activeTab, setActiveTab] = useState(
		'balance-changes',
	);

	const objectChanges =
		output.Transaction!.effects.changedObjects;
	const balanceChanges = output.Transaction!.balanceChanges;
	const objectTypes = output.Transaction!.objectTypes;

	// Compute the blake2b hash (ledger transaction hash)
	const ledgerTransactionHash = useMemo(() => {
		if (!bytes) return null;
		// Decode the base64-encoded transaction bytes
		const decodedBytes = fromBase64(bytes);
		const intentMessage = messageWithIntent(
			'TransactionData',
			decodedBytes,
		);
		const intentMessageDigest = blake2b(intentMessage, {
			dkLen: 32,
		});
		const intentMessageDigestHex = toHex(
			intentMessageDigest,
		);
		return `0x${intentMessageDigestHex}`;
	}, [bytes]);

	const tabs = [
		{
			id: 'balance-changes',
			title: 'Balance Changes',
			count: balanceChanges?.length,
			component: () => (
				<BalanceChanges changes={balanceChanges} />
			),
		},
		{
			id: 'object-changes',
			title: 'Object Changes',
			count: objectChanges?.length,
			component: () => (
				<ObjectChanges
					objects={objectChanges}
					objectTypes={objectTypes}
				/>
			),
		},
		{
			id: 'events',
			title: 'Events',
			count: output.Transaction!.events.length,
			component: () => (
				<Events events={output.Transaction!.events} />
			),
		},
		{
			id: 'transactions',
			title: 'Transactions',
			count:
				output.Transaction?.transaction.commands.length ||
				0,
			component: () => (
				<Transactions
					inputs={output.Transaction!.transaction!}
				/>
			),
		},
		{
			id: 'json',
			title: 'Raw JSON',
			component: () => (
				<Textarea
					value={JSON.stringify(output, null, 4)}
					rows={20}
					readOnly
					className="font-mono text-xs"
				/>
			),
		},
	];

	const activeTabData = tabs.find(
		(t) => t.id === activeTab,
	);

	return (
		<div className="space-y-4">
			<Overview output={output} />

			{/* Ledger Hash */}
			{ledgerTransactionHash && (
				<div className="border rounded p-3 bg-surface">
					<div className="flex items-center justify-between gap-2">
						<span className="text-sm font-medium text-muted-foreground">
							Ledger Hash:
						</span>
						<span className="font-mono text-xs break-all">
							{ledgerTransactionHash}
						</span>
					</div>
				</div>
			)}

			{/* Warning Alert */}
			<Alert variant="warning">
				<strong>Important:</strong> You should always
				validate the transaction details in your wallet
				before signing. Your wallet is the ultimate source
				of truth for what you're approving.
			</Alert>

			{/* Tab Navigation */}
			<div className="w-full">
				<div className="flex overflow-x-auto border-b">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={cn(
								'px-4 text-sm font-medium transition-colors relative shrink-0 py-3 cursor-pointer',
								activeTab === tab.id
									? 'text-info-foreground border-b-2 border-info-border'
									: 'text-muted-foreground hover:text-foreground',
							)}
						>
							{tab.title}
							{tab.count !== undefined && tab.count > 0 && (
								<Label
									variant="neutral"
									size="sm"
									className="ml-2"
								>
									{tab.count}
								</Label>
							)}
						</button>
					))}
				</div>

				{/* Tab Content */}
				<div className="py-6">
					{activeTabData?.component()}
				</div>
			</div>
		</div>
	);
}
