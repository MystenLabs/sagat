// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { type ReactNode } from 'react';

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { content } from '@/content';
import { prettifyType } from '@/lib/coin-type';
import { tryDecodePure } from '@/lib/decode-pure';

import { ArgBox, EmptyPanel, Field } from './parts';

const COPY = content.transactionPreview.commands;

type TxData = SuiClientTypes.TransactionData;
type TxInput = TxData['inputs'][number];
type Command = TxData['commands'][number];
type Argument = Record<string, unknown>;

// The commands' shapes vary per kind and the SDK types them as a union
// of optional members; read them loosely, as the JSON they are.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCommand = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyInput = any;

const COMMAND_DESCRIPTIONS: Record<string, string> =
	content.transactionPreview.commands.descriptions;

function Muted({ children }: { children: ReactNode }) {
	return (
		<span className="font-sans text-11 text-muted-foreground">
			{children}
		</span>
	);
}

function objectKindLabel(input: AnyInput): string | null {
	if (input.SharedObject) return COPY.objectKinds.shared;
	if (input.Receiving) return COPY.objectKinds.receiving;
	if (input.ImmOrOwnedObject) return COPY.objectKinds.owned;
	return null;
}

/** A transaction input: a decoded pure value or an object. */
function InputArg({
	input,
}: {
	input: TxInput | undefined;
}) {
	if (!input) return <ArgBox>{COPY.missingInput}</ArgBox>;
	const arg = input as AnyInput;

	if (arg.$kind === 'Pure' && arg.Pure?.bytes) {
		const candidates = tryDecodePure(arg.Pure.bytes);
		if (candidates.length === 0) {
			return (
				<ArgBox>
					<Muted>{COPY.pureBcs}</Muted>
					<span className="text-muted-foreground">
						{arg.Pure.bytes}
					</span>
				</ArgBox>
			);
		}
		const [primary, ...rest] = candidates;
		return (
			<ArgBox>
				<Muted>{primary.label}</Muted>
				<span>{primary.value}</span>
				{rest.length > 0 && (
					<Muted>
						{content.common.or}{' '}
						{rest
							.map((c) => `${c.label}: ${c.value}`)
							.join(', ')}
					</Muted>
				)}
			</ArgBox>
		);
	}

	if (arg.$kind === 'Object' && arg.Object) {
		const object =
			arg.Object.ImmOrOwnedObject ??
			arg.Object.SharedObject ??
			arg.Object.Receiving;
		if (!object) {
			return <ArgBox>{JSON.stringify(arg.Object)}</ArgBox>;
		}
		const kind = objectKindLabel(arg.Object);
		return (
			<ArgBox>
				{kind && <Muted>{COPY.objectKind(kind)}</Muted>}
				<span className="flex items-center">
					<ShortAddress address={object.objectId} />
				</span>
			</ArgBox>
		);
	}

	return (
		<ArgBox>
			{Object.entries(arg)
				.filter(
					([key, value]) =>
						value !== null && key !== '$kind',
				)
				.map(([key, value]) => (
					<span
						key={key}
						className="flex flex-wrap gap-1.5"
					>
						<Muted>{key}</Muted>
						{key === 'objectId' ? (
							<ShortAddress address={value as string} />
						) : typeof value === 'object' ? (
							JSON.stringify(value)
						) : (
							String(value)
						)}
					</span>
				))}
		</ArgBox>
	);
}

function Arg({
	argument,
	inputs,
}: {
	argument: Argument;
	inputs: TxInput[];
}) {
	if ('GasCoin' in argument && argument.GasCoin) {
		return <ArgBox>GasCoin</ArgBox>;
	}
	if ('Input' in argument) {
		return (
			<InputArg input={inputs[argument.Input as number]} />
		);
	}
	if ('Result' in argument) {
		return (
			<ArgBox>Result({argument.Result as number})</ArgBox>
		);
	}
	if ('NestedResult' in argument) {
		const [a, b] = argument.NestedResult as [
			number,
			number,
		];
		return (
			<ArgBox>
				NestedResult({a}, {b})
			</ArgBox>
		);
	}
	return <ArgBox>{JSON.stringify(argument)}</ArgBox>;
}

function Args({
	label,
	args,
	inputs,
}: {
	label: string;
	args: Argument[] | undefined;
	inputs: TxInput[];
}) {
	if (!args?.length) return null;
	return (
		<Field label={label}>
			{args.map((arg, i) => (
				<Arg key={i} argument={arg} inputs={inputs} />
			))}
		</Field>
	);
}

function CommandBody({
	command,
	inputs,
}: {
	command: AnyCommand;
	inputs: TxInput[];
}) {
	if (command.MoveCall) {
		const call = command.MoveCall;
		return (
			<>
				<Field label={COPY.target}>
					<span className="min-w-0 font-mono text-12 break-all">
						{`${prettifyType(call.package)}::${call.module}::${call.function}`}
					</span>
				</Field>
				{call.typeArguments?.length > 0 && (
					<Field label={COPY.typeArguments}>
						{call.typeArguments.map(
							(type: string, i: number) => (
								<ArgBox key={i}>
									{prettifyType(type)}
								</ArgBox>
							),
						)}
					</Field>
				)}
				<Args
					label={COPY.arguments}
					args={call.arguments}
					inputs={inputs}
				/>
			</>
		);
	}
	if (command.TransferObjects) {
		return (
			<>
				<Args
					label={COPY.objects}
					args={command.TransferObjects.objects}
					inputs={inputs}
				/>
				<Args
					label={COPY.to}
					args={[command.TransferObjects.address]}
					inputs={inputs}
				/>
			</>
		);
	}
	if (command.SplitCoins) {
		return (
			<>
				<Args
					label={COPY.fromCoin}
					args={[command.SplitCoins.coin]}
					inputs={inputs}
				/>
				<Args
					label={COPY.amounts}
					args={command.SplitCoins.amounts}
					inputs={inputs}
				/>
			</>
		);
	}
	if (command.MergeCoins) {
		return (
			<>
				<Args
					label={COPY.intoCoin}
					args={[command.MergeCoins.destination]}
					inputs={inputs}
				/>
				<Args
					label={COPY.fromCoins}
					args={command.MergeCoins.sources}
					inputs={inputs}
				/>
			</>
		);
	}
	if (command.MakeMoveVec) {
		return (
			<>
				{command.MakeMoveVec.type && (
					<Field label={content.common.fields.type}>
						<span className="min-w-0 font-mono text-12 break-all">
							{prettifyType(command.MakeMoveVec.type)}
						</span>
					</Field>
				)}
				<Args
					label={COPY.elements}
					args={command.MakeMoveVec.elements}
					inputs={inputs}
				/>
			</>
		);
	}
	// Publish, Upgrade and anything newer: the command as JSON.
	return (
		<ArgBox>
			{JSON.stringify(
				command.Publish ?? command.Upgrade ?? command,
			)}
		</ArgBox>
	);
}

/**
 * The transaction's commands in order, with their arguments decoded.
 * Numbered from 0, as `Result(n)` arguments refer to them.
 */
export function CommandsList({
	transaction,
}: {
	transaction: TxData;
}) {
	if (transaction.commands.length === 0) {
		return <EmptyPanel>{COPY.empty}</EmptyPanel>;
	}

	return (
		<ol className="flex flex-col gap-3">
			{transaction.commands.map(
				(command: Command, index: number) => {
					const kind =
						(command as AnyCommand).$kind ??
						Object.keys(command)[0] ??
						'Unknown';
					const description = COMMAND_DESCRIPTIONS[kind];
					return (
						<li
							key={index}
							className="flex flex-col gap-2 rounded-lg border p-3 text-13"
							data-testid="transaction-preview-command"
							data-kind={kind}
						>
							<div className="flex flex-wrap items-baseline gap-x-2">
								<span className="text-muted-foreground tabular-nums">
									{index}.
								</span>
								<span className="font-medium">{kind}</span>
								{description && (
									<span className="text-12 text-muted-foreground">
										{description}
									</span>
								)}
							</div>
							<CommandBody
								command={command}
								inputs={transaction.inputs}
							/>
						</li>
					);
				},
			)}
		</ol>
	);
}
