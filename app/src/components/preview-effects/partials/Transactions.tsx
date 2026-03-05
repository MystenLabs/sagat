// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { type ReactNode } from 'react';

import { ObjectLink } from '../ObjectLink';
import { PreviewCard } from '../PreviewCard';
import { tryDecodePure } from '../utils';

type TxData = SuiClientTypes.TransactionData;
type TxInput = TxData['inputs'][number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCommand = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyInput = any;

const COMMAND_LABELS: Record<string, string> = {
	MoveCall:
		"MoveCall (Direct Call to a Smart Contract's function)",
	TransferObjects:
		'TransferObjects (transfers the list of objects to the specified address)',
	SplitCoins:
		'SplitCoins (splits the coin into multiple coins)',
	MergeCoins:
		'MergeCoins (merges the coins into a single coin)',
	Publish: 'Publish (publishes a new package)',
	Upgrade: 'Upgrade (upgrades a package)',
	MakeMoveVec:
		'MakeMoveVec (creates a vector of Move objects)',
};

// --- Small display helpers ------------------------------------------------

function ArgumentCard({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<PreviewCard.Root className="h-full justify-center">
			<PreviewCard.Body>{children}</PreviewCard.Body>
		</PreviewCard.Root>
	);
}

function MonoLabel({ children }: { children: ReactNode }) {
	return (
		<span className="font-mono text-sm">{children}</span>
	);
}

function ObjectInput({ input }: { input: AnyInput }) {
	const obj =
		input.ImmOrOwnedObject ??
		input.SharedObject ??
		input.Receiving;

	if (!obj)
		return (
			<span className="font-mono text-xs">
				{JSON.stringify(input)}
			</span>
		);

	return <ObjectLink inputObject={obj.objectId} />;
}

// --- Argument resolution --------------------------------------------------

function CallArgDisplay({
	argument,
}: {
	argument: TxInput | undefined;
}) {
	if (!argument) return null;

	const input = argument as AnyInput;
	const kind: string = input.$kind;

	if (kind === 'Pure' && input.Pure?.bytes) {
		const candidates = tryDecodePure(input.Pure.bytes);
		if (candidates.length === 0) {
			return (
				<ArgumentCard>
					<div className="flex items-baseline gap-2">
						<span className="text-xs text-muted-foreground">
							Pure (BCS)
						</span>
						<span className="font-mono text-xs break-all text-muted-foreground">
							{input.Pure.bytes}
						</span>
					</div>
				</ArgumentCard>
			);
		}
		const [primary, ...rest] = candidates;
		return (
			<ArgumentCard>
				<div className="flex items-baseline gap-2">
					<span className="text-xs text-muted-foreground">
						{primary.label}
					</span>
					<span className="font-mono text-sm break-all">
						{primary.value}
					</span>
				</div>
				{rest.length > 0 && (
					<div className="mt-1 text-xs text-muted-foreground">
						or{' '}
						{rest
							.map((c) => `${c.label}: ${c.value}`)
							.join(', ')}
					</div>
				)}
			</ArgumentCard>
		);
	}

	if (kind === 'Object' && input.Object) {
		return (
			<ArgumentCard>
				<div className="flex items-center gap-2">
					<ObjectInput input={input.Object} />
				</div>
			</ArgumentCard>
		);
	}

	return (
		<ArgumentCard>
			{Object.entries(argument)
				.filter(
					([key, value]) =>
						value !== null && key !== '$kind',
				)
				.map(([argKey, value]) => (
					<div
						key={argKey}
						className="flex items-center shrink-0 gap-3 mb-3 justify-stretch"
					>
						<p className="capitalize min-w-[100px] shrink-0">
							{argKey}:{' '}
						</p>
						{argKey === 'objectId' ? (
							<ObjectLink inputObject={value as string} />
						) : typeof value === 'object' ? (
							JSON.stringify(value)
						) : (
							(value as ReactNode)
						)}
					</div>
				))}
		</ArgumentCard>
	);
}

function ArgumentDisplay({
	argument,
	inputs,
}: {
	argument: Record<string, unknown>;
	inputs: TxInput[];
}) {
	if ('GasCoin' in argument && argument.GasCoin) {
		return (
			<ArgumentCard>
				<MonoLabel>GasCoin</MonoLabel>
			</ArgumentCard>
		);
	}

	if ('Input' in argument) {
		return (
			<CallArgDisplay
				argument={inputs[argument.Input as number]}
			/>
		);
	}

	if ('Result' in argument) {
		return (
			<ArgumentCard>
				<MonoLabel>
					Result({argument.Result as number})
				</MonoLabel>
			</ArgumentCard>
		);
	}

	if ('NestedResult' in argument) {
		const [a, b] = argument.NestedResult as [
			number,
			number,
		];
		return (
			<ArgumentCard>
				<MonoLabel>
					NestedResult({a}, {b})
				</MonoLabel>
			</ArgumentCard>
		);
	}

	return (
		<ArgumentCard>{JSON.stringify(argument)}</ArgumentCard>
	);
}

function ArgumentList({
	args,
	inputs,
}: {
	args: Record<string, unknown>[];
	inputs: TxInput[];
}) {
	return (
		<div className="flex overflow-x-auto items-stretch gap-3 my-3">
			{args.map((arg, i) => (
				<div key={i} className="shrink-0 flex">
					<ArgumentDisplay argument={arg} inputs={inputs} />
				</div>
			))}
		</div>
	);
}

// --- Per-command renderers ------------------------------------------------

function MoveCallBody({
	cmd,
	inputs,
}: {
	cmd: AnyCommand['MoveCall'];
	inputs: TxInput[];
}) {
	return (
		<>
			<div className="mb-3">
				Target:{' '}
				{`${cmd.package}::${cmd.module}::${cmd.function}`}
			</div>

			{cmd.typeArguments?.length > 0 && (
				<div className="mb-3">
					<label>Type Arguments: </label>[
					{cmd.typeArguments.join(', ')}]
				</div>
			)}

			{cmd.arguments?.length > 0 && (
				<div>
					<label>Inputs: </label>
					<ArgumentList
						args={cmd.arguments}
						inputs={inputs}
					/>
				</div>
			)}
		</>
	);
}

function TransferObjectsBody({
	cmd,
	inputs,
}: {
	cmd: AnyCommand['TransferObjects'];
	inputs: TxInput[];
}) {
	return (
		<div>
			<label>Objects: </label>
			<ArgumentList args={cmd.objects} inputs={inputs} />
			<label>Transfer to:</label>
			<ArgumentList args={[cmd.address]} inputs={inputs} />
		</div>
	);
}

function SplitCoinsBody({
	cmd,
	inputs,
}: {
	cmd: AnyCommand['SplitCoins'];
	inputs: TxInput[];
}) {
	return (
		<>
			<div>
				<label>From Coin: </label>
				<ArgumentList args={[cmd.coin]} inputs={inputs} />
			</div>
			<div>
				<label>Splits into: </label>
				<ArgumentList args={cmd.amounts} inputs={inputs} />
			</div>
		</>
	);
}

function MergeCoinsBody({
	cmd,
	inputs,
}: {
	cmd: AnyCommand['MergeCoins'];
	inputs: TxInput[];
}) {
	return (
		<>
			<div>
				<label>To Coin: </label>
				<ArgumentList
					args={[cmd.destination]}
					inputs={inputs}
				/>
			</div>
			<div>
				<label>From coins: </label>
				<ArgumentList args={cmd.sources} inputs={inputs} />
			</div>
		</>
	);
}

// --- Transaction (single command card) ------------------------------------

function CommandBody({
	command,
	inputs,
}: {
	command: AnyCommand;
	inputs: TxInput[];
}) {
	if (command.MoveCall)
		return (
			<MoveCallBody
				cmd={command.MoveCall}
				inputs={inputs}
			/>
		);
	if (command.TransferObjects)
		return (
			<TransferObjectsBody
				cmd={command.TransferObjects}
				inputs={inputs}
			/>
		);
	if (command.SplitCoins)
		return (
			<SplitCoinsBody
				cmd={command.SplitCoins}
				inputs={inputs}
			/>
		);
	if (command.MergeCoins)
		return (
			<MergeCoinsBody
				cmd={command.MergeCoins}
				inputs={inputs}
			/>
		);

	if (command.Publish || command.Upgrade)
		return <>{JSON.stringify(command)}</>;

	if (command.MakeMoveVec) {
		return (
			<div>
				{/* TODO: Create a sample tx with MakeMoveVec to render this better. */}
				<label>Objects: </label>
				{JSON.stringify(command.MakeMoveVec)}
			</div>
		);
	}

	return null;
}

function Transaction({
	command,
	inputs,
	index,
}: {
	command: AnyCommand;
	inputs: TxInput[];
	index: number;
}) {
	const kind =
		command.$kind ?? Object.keys(command)[0] ?? 'Unknown';

	return (
		<PreviewCard.Root className="mb-6">
			<PreviewCard.Header>
				<p>
					{index}. Type:{' '}
					<strong>{COMMAND_LABELS[kind] || kind}</strong>
				</p>
			</PreviewCard.Header>
			<PreviewCard.Body>
				<CommandBody command={command} inputs={inputs} />
			</PreviewCard.Body>
		</PreviewCard.Root>
	);
}

// --- Public entry point ---------------------------------------------------

export function Transactions({
	inputs,
}: {
	inputs: TxData;
}) {
	return (
		<div>
			{inputs.commands.map((command, index) => (
				<Transaction
					key={index}
					command={command as AnyCommand}
					inputs={inputs.inputs}
					index={index}
				/>
			))}
		</div>
	);
}
