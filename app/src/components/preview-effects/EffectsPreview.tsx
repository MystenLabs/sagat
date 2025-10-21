import { type DryRunTransactionBlockResponse } from '@mysten/sui/client';
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
	output: DryRunTransactionBlockResponse;
	bytes?: string;
}) {
	const [activeTab, setActiveTab] = useState(
		'balance-changes',
	);

	const { objectChanges, balanceChanges } = output;

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
				<ObjectChanges objects={objectChanges} />
			),
		},
		{
			id: 'events',
			title: 'Events',
			count: output.events.length,
			component: () => <Events events={output.events} />,
		},
		{
			id: 'transactions',
			title: 'Transactions',
			count:
				output.input.transaction.kind ===
				'ProgrammableTransaction'
					? output.input.transaction.transactions.length
					: 0,
			component: () => (
				<Transactions inputs={output.input} />
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
				<div className="border rounded p-3 bg-gray-50">
					<div className="flex items-center justify-between gap-2">
						<span className="text-sm font-medium text-gray-700">
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
									? 'text-blue-600 border-b-2 border-blue-600'
									: 'text-gray-600 hover:text-gray-900',
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
