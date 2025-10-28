import {
	getFullnodeUrl,
	SuiClient,
} from '@mysten/sui/client';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';

import {
	LocalNetworkSelector,
	type LocalNetwork,
} from '@/components/LocalNetworkSelector';
import { Button } from '@/components/ui/button';
import { FieldDisplay } from '@/components/ui/FieldDisplay';
import { Textarea } from '@/components/ui/textarea';

interface BroadcastResult {
	digest: string;
}

function TransactionBytesInput({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="space-y-2">
			<label
				htmlFor="transaction-bytes"
				className="text-sm font-medium text-gray-700"
			>
				Transaction Bytes (base64)
			</label>
			<Textarea
				id="transaction-bytes"
				placeholder="Enter transaction bytes in base64 format..."
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={4}
				className="font-mono text-sm"
			/>
		</div>
	);
}

function SignatureInput({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="space-y-2">
			<label
				htmlFor="signature"
				className="text-sm font-medium text-gray-700"
			>
				Combined Signature (base64)
			</label>
			<Textarea
				id="signature"
				placeholder="Enter combined signature in base64 format..."
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={3}
				className="font-mono text-sm"
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
		<div className="border border-green-200 bg-white rounded-lg p-4">
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					<CheckCircle className="w-5 h-5 text-green-600" />
					<h3 className="font-medium text-gray-900">
						Transaction Broadcast Successfully
					</h3>
				</div>
				<Button
					type="button"
					onClick={onReset}
					variant="outline"
					size="sm"
				>
					Broadcast Another
				</Button>
			</div>
			<div className="space-y-3">
				<FieldDisplay
					label="Transaction Digest"
					value={result.digest}
				/>
			</div>
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
		<div className="border border-red-200 bg-white rounded-lg p-4">
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					<AlertCircle className="w-5 h-5 text-red-600" />
					<h3 className="font-medium text-gray-900">
						Broadcast Failed
					</h3>
				</div>
				<Button
					type="button"
					onClick={onReset}
					variant="outline"
					size="sm"
				>
					Try Again
				</Button>
			</div>
			<p className="text-sm text-red-600 whitespace-pre-wrap">
				{error}
			</p>
		</div>
	);
}

export default function BroadcastTool() {
	const [localNetwork, setLocalNetwork] =
		useState<LocalNetwork>('mainnet');
	const [transactionBytes, setTransactionBytes] = useState('');
	const [signature, setSignature] = useState('');
	const [broadcasting, setBroadcasting] = useState(false);
	const [result, setResult] = useState<BroadcastResult | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

	const handleBroadcast = async () => {
		if (!transactionBytes || !signature) {
			setError('Both transaction bytes and signature are required');
			return;
		}

		setBroadcasting(true);
		setError(null);
		setResult(null);

		try {
			const client = new SuiClient({
				url: getFullnodeUrl(localNetwork),
			});

			const executionResult =
				await client.executeTransactionBlock({
					transactionBlock: transactionBytes,
					signature,
					options: {
						showEffects: true,
						showObjectChanges: true,
					},
				});

			await client.waitForTransaction({
				digest: executionResult.digest,
			});

			setResult({
				digest: executionResult.digest,
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
		setTransactionBytes('');
		setSignature('');
	};

	const canBroadcast =
		transactionBytes.trim() && signature.trim() && !broadcasting;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div>
					<p className="text-sm text-gray-600">
						Broadcast a signed transaction to the Sui network.
					</p>
					<p className="text-xs text-gray-500 mt-1">
						Network selection is local to this tool
					</p>
				</div>
				<LocalNetworkSelector
					network={localNetwork}
					onNetworkChange={setLocalNetwork}
				/>
			</div>

			<div className="space-y-6">
				{!result && !error && (
					<>
						<TransactionBytesInput
							value={transactionBytes}
							onChange={setTransactionBytes}
						/>

						<SignatureInput
							value={signature}
							onChange={setSignature}
						/>

						<div className="flex justify-end pt-4 border-t">
							<Button
								type="button"
								onClick={handleBroadcast}
								disabled={!canBroadcast}
							>
								{broadcasting
									? 'Broadcasting...'
									: 'Broadcast Transaction'}
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
					<BroadcastError error={error} onReset={handleReset} />
				)}
			</div>
		</div>
	);
}
