// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { fromBase64 } from '@mysten/sui/utils';
import { Radio } from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import { useNetwork } from '@/contexts/NetworkContext';
import { type SuiNetwork } from '@/lib/network';
import { getExplorerUrl, safeDecode } from '@/lib/utils';

import {
	BytesField,
	NetworkField,
	ReadOnlyField,
	ResultActions,
	ToolActions,
	ToolCard,
} from './parts';

interface BroadcastError {
	message: string;
	/** The network it was broadcast on, named when it isn't the current one. */
	network: SuiNetwork;
}

interface BroadcastResult {
	digest: string;
	/** The network it was broadcast on, for the explorer link. */
	network: string;
}

const CANT_READ_BYTES =
	'Can’t read this as transaction bytes. Paste the full bytes in base64.';
const CANT_READ_SIGNATURE =
	'Can’t read this as a signature. Paste the combined signature in base64.';

/** Whether the value decodes as base64. */
function isBase64(value: string) {
	try {
		fromBase64(value);
		return true;
	} catch {
		return false;
	}
}

function BroadcastResultDisplay({
	result,
	onReset,
}: {
	result: BroadcastResult;
	onReset: () => void;
}) {
	const explorerUrl = getExplorerUrl(
		result.digest,
		result.network,
	);

	return (
		<div
			className="flex flex-col gap-5"
			data-testid="broadcast-result"
			data-digest={result.digest}
		>
			<Alert variant="success">
				Sent. The network accepted this transaction.
			</Alert>
			<ReadOnlyField
				label="Transaction digest"
				value={result.digest}
			/>
			<ResultActions
				onReset={onReset}
				resetLabel="Broadcast another"
				resetTestId="broadcast-reset-button"
				explorerUrl={explorerUrl}
				copyValue={result.digest}
				copyLabel="Copy digest"
				copyMessage="Digest copied"
			/>
		</div>
	);
}

export default function BroadcastTool() {
	const client = useDAppKit().getClient();
	const { network } = useNetwork();
	const [transactionBytes, setTransactionBytes] =
		useState('');
	const [signature, setSignature] = useState('');
	const [broadcasting, setBroadcasting] = useState(false);
	const [result, setResult] =
		useState<BroadcastResult | null>(null);
	const [error, setError] = useState<BroadcastError | null>(
		null,
	);

	const bytesInput = transactionBytes.trim();
	const signatureInput = signature.trim();
	const bytesUnreadable =
		!!bytesInput && !isBase64(bytesInput);
	const signatureUnreadable =
		!!signatureInput && !isBase64(signatureInput);
	const canBroadcast =
		!!bytesInput &&
		!!signatureInput &&
		!bytesUnreadable &&
		!signatureUnreadable &&
		!broadcasting;

	const handleBroadcast = async () => {
		if (!canBroadcast) return;

		const broadcastNetwork = network;
		setBroadcasting(true);
		setError(null);
		setResult(null);

		try {
			const result = await client.executeTransaction({
				transaction: fromBase64(transactionBytes.trim()),
				signatures: [signature.trim()],
				include: {
					effects: true,
				},
			});

			if (result.FailedTransaction) {
				setError({
					message:
						result.FailedTransaction.effects.status.error
							?.message ||
						'Failed to broadcast transaction',
					network: broadcastNetwork,
				});
				return;
			}

			await client.waitForTransaction({
				digest: result.Transaction!.digest,
			});

			setResult({
				digest: result.Transaction!.digest,
				network: broadcastNetwork,
			});
		} catch (err) {
			setError({
				message:
					err instanceof Error
						? err.message
						: 'Failed to broadcast transaction',
				network: broadcastNetwork,
			});
		} finally {
			setBroadcasting(false);
		}
	};

	// An edit makes the last failure stale.
	const edit =
		(setValue: (value: string) => void) =>
		(value: string) => {
			setValue(value);
			setError(null);
		};

	const handleReset = () => {
		setTransactionBytes('');
		setSignature('');
		setResult(null);
		setError(null);
	};

	return (
		<>
			{error && (
				<Alert
					variant="error"
					className="mb-5"
					data-testid="broadcast-error"
				>
					<span className="whitespace-pre-wrap">
						{error.network === network
							? 'Broadcast failed'
							: `Broadcast on ${error.network} failed`}
						: {safeDecode(error.message)}
					</span>
				</Alert>
			)}
			<ToolCard>
				<NetworkField />
				<BytesField
					id="transaction-bytes"
					label="Transaction bytes"
					testId="broadcast-bytes-input"
					placeholder="Paste the transaction bytes (base64)"
					minHeight="min-h-30"
					value={transactionBytes}
					onChange={edit(setTransactionBytes)}
					readOnly={!!result || broadcasting}
					error={
						bytesUnreadable ? CANT_READ_BYTES : undefined
					}
					errorTestId="broadcast-bytes-error"
				/>
				<BytesField
					id="signature"
					label="Combined signature"
					testId="broadcast-signature-input"
					placeholder="Paste the combined signature (base64)"
					minHeight="min-h-24"
					value={signature}
					onChange={edit(setSignature)}
					readOnly={!!result || broadcasting}
					error={
						signatureUnreadable
							? CANT_READ_SIGNATURE
							: undefined
					}
					errorTestId="broadcast-signature-error"
				/>

				{result ? (
					<BroadcastResultDisplay
						result={result}
						onReset={handleReset}
					/>
				) : (
					<ToolActions>
						<Button
							type="button"
							onClick={handleBroadcast}
							disabled={!canBroadcast}
							className={disabledButton}
							data-testid="broadcast-button"
						>
							<Radio />
							{broadcasting
								? 'Broadcasting…'
								: 'Broadcast transaction'}
						</Button>
					</ToolActions>
				)}
			</ToolCard>
		</>
	);
}
