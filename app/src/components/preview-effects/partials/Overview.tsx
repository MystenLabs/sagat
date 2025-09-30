// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { DryRunTransactionBlockResponse, GasCostSummary } from '@mysten/sui/client';
import { ReactNode, useState } from 'react';
import { Copy, Check } from 'lucide-react';

import { ObjectLink } from '../ObjectLink';
import { onChainAmountToFloat } from '../utils';
import { useNetwork } from '@/contexts/NetworkContext';

const calculateGas = (gas: GasCostSummary): string => {
	return (
		onChainAmountToFloat(
			(
				BigInt(gas.computationCost) +
				BigInt(gas.storageCost) -
				BigInt(gas.storageRebate)
			).toString(),
			9,
		)?.toString() || '-'
	);
};

export function Overview({ output }: { output: DryRunTransactionBlockResponse }) {
	const { network } = useNetwork();
	const [copied, setCopied] = useState(false);

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const metadata: Record<string, ReactNode> = {
		digest: (
			<div className="flex items-center gap-2">
				<span className="font-mono text-sm break-all">{output.effects.transactionDigest}</span>
				<button
					onClick={() => copyToClipboard(output.effects.transactionDigest)}
					className="p-1 hover:bg-gray-100 rounded"
				>
					{copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-600" />}
				</button>
			</div>
		),
		network,
		status:
			output.effects.status?.status === 'success'
				? '✅ Transaction dry run executed succesfully!'
				: output.effects.status?.status === 'failure'
					? '❌ Transaction failed to execute!'
					: null,
		sender: (
			<span className="flex gap-2 items-center">
				<ObjectLink
					owner={{
						AddressOwner: output.input.sender,
					}}
				/>
			</span>
		),
		epoch: output.effects.executedEpoch,
		gas: calculateGas(output.effects.gasUsed) + ' SUI',
	};

	return (
		<div className="border p-3 w-full rounded">
			{Object.entries(metadata).map(([key, value]) => (
				<div key={key} className="flex items-center gap-3 ">
					<span className="capitalize">{key}: </span>
					{value}
				</div>
			))}
		</div>
	);
}
