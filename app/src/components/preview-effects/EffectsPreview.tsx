import { type DryRunTransactionBlockResponse } from '@mysten/sui/client';
import { useState } from 'react';

import { cn } from '../../lib/utils';
import { Textarea } from '../ui/textarea';
import { BalanceChanges } from './partials/BalanceChanges';
import { Events } from './partials/Events';
import { ObjectChanges } from './partials/ObjectChanges';
import { Overview } from './partials/Overview';
import { Transactions } from './partials/Transactions';

export function EffectsPreview({
	output,
}: {
	output: DryRunTransactionBlockResponse;
}) {
	const [activeTab, setActiveTab] = useState(
		'balance-changes',
	);

	const { objectChanges, balanceChanges } = output;

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

			{/* Tab Navigation */}
			<div className="w-full">
				<div className="flex overflow-x-auto border-b">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={cn(
								'px-4 py-2 text-sm font-medium transition-colors relative',
								activeTab === tab.id
									? 'text-blue-600 border-b-2 border-blue-600'
									: 'text-gray-600 hover:text-gray-900',
							)}
						>
							{tab.title}
							{tab.count !== undefined && tab.count > 0 && (
								<span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
									{tab.count}
								</span>
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
