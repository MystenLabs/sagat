// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { fromBase64 } from '@mysten/sui/utils';
import { AlertCircle, Check } from 'lucide-react';
import { useState } from 'react';

import { NetworkSelector } from '@/components/LocalNetworkSelector';
import { Button } from '@/components/ui/button';
import { FieldDisplay } from '@/components/ui/FieldDisplay';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface BroadcastResult {
	digest: string;
}

function BytesField({
	id,
	label,
	testId,
	placeholder,
	rows,
	value,
	onChange,
}: {
	id: string;
	label: string;
	testId: string;
	placeholder: string;
	rows: number;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			<Textarea
				id={id}
				data-testid={testId}
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={rows}
				className="font-mono text-12"
			/>
		</div>
	);
}

function BroadcastResultDisplay({
	result,
	onReset,
}: {
	result: BroadcastResult;
	onReset: () => void;
}) {
	return (
		<div
			className="flex flex-col gap-4 rounded-lg border border-success-border bg-surface p-4"
			data-testid="broadcast-result"
			data-digest={result.digest}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 text-14 font-medium">
					<Check
						strokeWidth={3}
						className="size-4 text-success-foreground"
					/>
					Transaction broadcast
				</div>
				<Button
					type="button"
					onClick={onReset}
					variant="outline"
					size="sm"
					data-testid="broadcast-reset-button"
				>
					Broadcast another
				</Button>
			</div>
			<FieldDisplay
				label="Transaction digest"
				value={result.digest}
			/>
		</div>
	);
}

function BroadcastError({
	error,
	onReset,
}: {
	error: string;
	onReset: () => void;
}) {
	return (
		<div
			role="alert"
			className="flex flex-col gap-3 rounded-lg border border-error-border bg-error p-4"
			data-testid="broadcast-error"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 text-14 font-medium text-error-foreground">
					<AlertCircle className="size-4" />
					Broadcast failed
				</div>
				<Button
					type="button"
					onClick={onReset}
					variant="outline"
					size="sm"
					data-testid="broadcast-reset-button"
				>
					Try again
				</Button>
			</div>
			<p className="text-13 whitespace-pre-wrap text-error-foreground">
				{error}
			</p>
		</div>
	);
}

export default function BroadcastTool() {
	const client = useDAppKit().getClient();
	const [transactionBytes, setTransactionBytes] =
		useState('');
	const [signature, setSignature] = useState('');
	const [broadcasting, setBroadcasting] = useState(false);
	const [result, setResult] =
		useState<BroadcastResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleBroadcast = async () => {
		if (!transactionBytes || !signature) {
			setError(
				'Both transaction bytes and signature are required',
			);
			return;
		}

		setBroadcasting(true);
		setError(null);
		setResult(null);

		try {
			const result = await client.executeTransaction({
				transaction: fromBase64(transactionBytes),
				signatures: [signature],
				include: {
					effects: true,
				},
			});

			if (result.FailedTransaction) {
				setError(
					result.FailedTransaction.effects.status.error
						?.message || 'Failed to broadcast transaction',
				);
				return;
			}

			await client.waitForTransaction({
				digest: result.Transaction!.digest,
			});

			setResult({
				digest: result.Transaction!.digest,
			});
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: 'Failed to broadcast transaction',
			);
		} finally {
			setBroadcasting(false);
		}
	};

	const handleReset = () => {
		setResult(null);
		setError(null);
	};

	const canBroadcast =
		transactionBytes.trim() &&
		signature.trim() &&
		!broadcasting;

	return (
		<div className="flex flex-col gap-6">
			{!result && !error && (
				<>
					<BytesField
						id="transaction-bytes"
						label="Transaction bytes (base64)"
						testId="broadcast-bytes-input"
						placeholder="Paste the transaction bytes…"
						rows={4}
						value={transactionBytes}
						onChange={setTransactionBytes}
					/>
					<BytesField
						id="signature"
						label="Combined signature (base64)"
						testId="broadcast-signature-input"
						placeholder="Paste the combined signature…"
						rows={3}
						value={signature}
						onChange={setSignature}
					/>
					<div className="flex items-center justify-between gap-3 border-t pt-4">
						<NetworkSelector />
						<Button
							type="button"
							onClick={handleBroadcast}
							disabled={!canBroadcast}
							data-testid="broadcast-button"
						>
							{broadcasting ? 'Broadcasting…' : 'Broadcast'}
						</Button>
					</div>
				</>
			)}

			{result && (
				<BroadcastResultDisplay
					result={result}
					onReset={handleReset}
				/>
			)}

			{error && (
				<BroadcastError
					error={error}
					onReset={handleReset}
				/>
			)}
		</div>
	);
}
