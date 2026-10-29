// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { fromBase64 } from '@mysten/sui/utils';
import {
	Copy,
	ExternalLink,
	Radio,
	RefreshCw,
} from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import {
	Button,
	buttonVariants,
	disabledButton,
} from '@/components/ui/button';
import { useNetwork } from '@/contexts/NetworkContext';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { getExplorerUrl, safeDecode } from '@/lib/utils';

import {
	BytesField,
	NetworkField,
	ReadOnlyField,
	ToolActions,
	ToolCard,
} from './parts';

interface BroadcastResult {
	digest: string;
}

function BroadcastResultDisplay({
	result,
	onReset,
}: {
	result: BroadcastResult;
	onReset: () => void;
}) {
	const { network } = useNetwork();
	const explorerUrl = getExplorerUrl(
		result.digest,
		network,
	);
	const { copy } = useCopyToClipboard('Digest copied');

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
			<ToolActions>
				<Button
					type="button"
					variant="outline"
					onClick={onReset}
					data-testid="broadcast-reset-button"
				>
					<RefreshCw />
					Broadcast another
				</Button>
				{explorerUrl && (
					<a
						href={explorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						className={buttonVariants({
							variant: 'outline',
						})}
					>
						<ExternalLink />
						View on explorer
					</a>
				)}
				<Button
					type="button"
					onClick={() => copy(result.digest)}
				>
					<Copy />
					Copy digest
				</Button>
			</ToolActions>
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
		if (!transactionBytes.trim() || !signature.trim())
			return;

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

	const canBroadcast =
		!!transactionBytes.trim() &&
		!!signature.trim() &&
		!broadcasting;

	return (
		<>
			{error && (
				<Alert
					variant="error"
					className="mb-5"
					data-testid="broadcast-error"
				>
					<span className="whitespace-pre-wrap">
						Broadcast failed: {safeDecode(error)}
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
					readOnly={!!result}
				/>
				<BytesField
					id="signature"
					label="Combined signature"
					testId="broadcast-signature-input"
					placeholder="Paste the combined signature (base64)"
					minHeight="min-h-24"
					value={signature}
					onChange={edit(setSignature)}
					readOnly={!!result}
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
