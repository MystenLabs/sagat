// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { type ReactNode } from 'react';

import { ObjectLink } from '../ObjectLink';
import { PreviewCard } from '../PreviewCard';

type TxData = SuiClientTypes.TransactionData;
type TxInput = TxData['inputs'][number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCommand = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyInput = any;

export function Transactions({
	inputs,
}: {
	inputs: TxData;
}) {
	return (
		<div className="">
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

// TODO: The gRPC proto `Input` has a `literal` field (google.protobuf.Value, field 1000)
// that the server populates with the decoded JSON value (same as JSON-RPC's `SuiCallArg.value`).
// The SDK's `grpcInputToCallArg` in transaction-resolver.ts ignores `input.literal` and only
// maps `input.pure` (raw BCS bytes). Once the SDK exposes `literal`, use it here instead of
// showing raw bytes.
function renderObjectInput(input: AnyInput) {
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

const getCallArgDisplay = (
	argument: TxInput | undefined,
) => {
	if (!argument) return null;

	const input = argument as AnyInput;
	const kind: string = input.$kind;

	if (kind === 'Pure' && input.Pure?.bytes) {
		return (
			<PreviewCard.Root>
				<PreviewCard.Body>
					<span className="font-mono text-xs break-all text-muted-foreground">
						Pure (BCS): {input.Pure.bytes}
					</span>
				</PreviewCard.Body>
			</PreviewCard.Root>
		);
	}

	if (kind === 'Object' && input.Object) {
		return (
			<PreviewCard.Root>
				<PreviewCard.Body>
					<div className="flex items-center gap-2">
						{renderObjectInput(input.Object)}
					</div>
				</PreviewCard.Body>
			</PreviewCard.Root>
		);
	}

	return (
		<PreviewCard.Root>
			<PreviewCard.Body>
				{Object.entries(argument)
					.filter(
						([key, value]) =>
							value !== null && key !== '$kind',
					)
					.map(([argKey, value]) => (
						<div
							key={argKey}
							className="flex items-center shrink-0 gap-3 mb-3 justify-stretch "
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
			</PreviewCard.Body>
		</PreviewCard.Root>
	);
};

const getArgumentDisplay = (
	argument: Record<string, unknown>,
	inputs: TxInput[],
) => {
	if ('GasCoin' in argument && argument.GasCoin) {
		return <span>GasCoin</span>;
	}

	if ('Input' in argument) {
		return getCallArgDisplay(
			inputs[argument.Input as number],
		);
	}

	if ('Result' in argument) {
		return <span>Result({argument.Result as number})</span>;
	}

	if ('NestedResult' in argument) {
		const nr = argument.NestedResult as [number, number];
		return (
			<span>
				NestedResult({nr[0]}, {nr[1]})
			</span>
		);
	}

	return (
		<PreviewCard.Root>
			<PreviewCard.Body>
				{JSON.stringify(argument)}
			</PreviewCard.Body>
		</PreviewCard.Root>
	);
};

const renderArguments = (
	args: Record<string, unknown>[],
	inputs: TxInput[],
) => {
	return (
		<div className="flex overflow-x-auto gap-3 my-3">
			{args.map((arg, index) => (
				<div key={index} className="shrink-0">
					{getArgumentDisplay(arg, inputs)}
				</div>
			))}
		</div>
	);
};

const renderFooter = (type: string, index: number) => {
	return (
		<PreviewCard.Header>
			<p>
				{index}. Type: <strong>{type}</strong>
			</p>
		</PreviewCard.Header>
	);
};

const FOOTERS: Record<string, string> = {
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
			{renderFooter(FOOTERS[kind] || kind, index)}
			<PreviewCard.Body>
				<>
					{command.MoveCall && (
						<>
							<div className="mb-3">
								Target:{' '}
								{`${command.MoveCall.package}::${command.MoveCall.module}::${command.MoveCall.function}`}
							</div>
							{command.MoveCall.typeArguments?.length >
								0 && (
								<div className="mb-3">
									<label>Type Arguments: </label>[
									{command.MoveCall.typeArguments.join(
										', ',
									)}
									]
								</div>
							)}

							{command.MoveCall.arguments?.length > 0 && (
								<div>
									<label>Inputs: </label>
									{renderArguments(
										command.MoveCall.arguments,
										inputs,
									)}
								</div>
							)}
						</>
					)}

					{command.TransferObjects && (
						<>
							<div>
								<label>Objects: </label>
								{renderArguments(
									command.TransferObjects.objects,
									inputs,
								)}

								<label>Transfer to:</label>
								{renderArguments(
									[command.TransferObjects.address],
									inputs,
								)}
							</div>
						</>
					)}

					{command.SplitCoins && (
						<>
							<div>
								<label>From Coin: </label>
								{renderArguments(
									[command.SplitCoins.coin],
									inputs,
								)}
							</div>
							<div>
								<label>Splits into: </label>
								{renderArguments(
									command.SplitCoins.amounts,
									inputs,
								)}
							</div>
						</>
					)}

					{command.MergeCoins && (
						<>
							<div>
								<label>To Coin: </label>
								{renderArguments(
									[command.MergeCoins.destination],
									inputs,
								)}
							</div>
							<div>
								<label>From coins: </label>
								{renderArguments(
									command.MergeCoins.sources,
									inputs,
								)}
							</div>
						</>
					)}

					{(command.Publish || command.Upgrade) && (
						<>{JSON.stringify(command)}</>
					)}

					{command.MakeMoveVec && (
						<>
							{/* TODO: Create a sample tx with MakeMoveVec to render this better. */}
							<div>
								<label>Objects: </label>
								{JSON.stringify(command.MakeMoveVec)}
							</div>
						</>
					)}
				</>
			</PreviewCard.Body>
		</PreviewCard.Root>
	);
}
