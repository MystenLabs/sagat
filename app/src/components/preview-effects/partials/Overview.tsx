// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { type ReactNode } from 'react';

import { CopyButton } from '../../ui/CopyButton';
import { ObjectLink } from '../ObjectLink';
import { onChainAmountToFloat } from '../utils';

const calculateGas = (
	gas: SuiClientTypes.GasCostSummary,
): string => {
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

export function Overview({
	output,
}: {
	output: SuiClientTypes.SimulateTransactionResult<{
		effects: true;
		transaction: true;
	}>;
}) {
	const metadata: Record<string, ReactNode> = {
		digest: (
			<div className="flex items-center gap-1.5 min-w-0">
				<span className="font-mono text-sm break-all">
					{output.Transaction!.digest}
				</span>
				<CopyButton
					value={output.Transaction!.digest}
					size="xs"
					className="size-3.5 p-0 text-muted-foreground [&_svg]:size-3 hover:bg-transparent hover:text-foreground"
					successMessage="Digest copied"
				/>
			</div>
		),
		status: output.Transaction!.effects.status.success
			? '✅ Transaction dry run executed succesfully!'
			: output.Transaction!.effects.status.error
				? '❌ Transaction failed to execute!'
				: null,
		sender: (
			<span className="flex gap-2 items-center">
				<ObjectLink
					owner={{
						$kind: 'AddressOwner',
						AddressOwner:
							output.Transaction!.transaction.sender!,
					}}
				/>
			</span>
		),
		epoch: output.Transaction!.epoch,
		gas:
			calculateGas(output.Transaction!.effects.gasUsed) +
			' SUI',
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
