// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import type { SuiClientTypes } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import {
	AlertCircle,
	Check,
	ExternalLink,
	Loader2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { NetworkSelector } from '@/components/LocalNetworkSelector';
import { EffectsPreview } from '@/components/preview-effects/EffectsPreview';
import { IntentSummary } from '@/components/preview-effects/IntentSummary';
import { Alert } from '@/components/ui/Alert';
import {
	Button,
	buttonVariants,
} from '@/components/ui/button';
import { FieldDisplay } from '@/components/ui/FieldDisplay';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { type TransactionAnalysis } from '@/hooks/useTransactionAnalysis';
import { useTransactionPreview } from '@/hooks/useTransactionPreview';
import { getExplorerUrl } from '@/lib/utils';

type SimulateResult =
	SuiClientTypes.SimulateTransactionResult<{
		effects: true;
		balanceChanges: true;
		events: true;
		transaction: true;
		objectTypes: true;
	}>;

interface SignedResult {
	digest?: string;
	signature: string;
	bytes: string;
}

function TransactionInput({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-3">
				<Label htmlFor="transaction-data">
					Transaction data (JSON or base64)
				</Label>
				<NetworkSelector />
			</div>
			<Textarea
				id="transaction-data"
				data-testid="transaction-data-input"
				placeholder="Paste transaction JSON or base64 bytes…"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={6}
				className="font-mono text-12"
			/>
		</div>
	);
}

function PreviewResult({
	isSuccess,
	data,
	error,
	isLoading,
	bytes,
	analysis,
	isAnalysisLoading,
	analysisError,
}: {
	isSuccess: boolean;
	data: SimulateResult | undefined;
	error: Error | null;
	isLoading: boolean;
	bytes?: string;
	analysis?: TransactionAnalysis;
	isAnalysisLoading?: boolean;
	analysisError?: Error | null;
}) {
	if (isLoading) {
		return (
			<div
				role="status"
				className="flex items-center gap-2 rounded-lg border bg-surface p-4 text-13 text-muted-foreground"
			>
				<Loader2 className="size-4 animate-spin" />
				Previewing transaction…
			</div>
		);
	}

	return (
		<div
			className="flex flex-col gap-3"
			data-testid="transaction-preview-result"
			data-result={isSuccess ? 'success' : 'failure'}
		>
			<div className="flex items-center gap-2 text-14 font-medium">
				{isSuccess ? (
					<>
						<Check
							strokeWidth={3}
							className="size-4 text-success-foreground"
						/>
						Preview succeeded
					</>
				) : (
					<>
						<AlertCircle className="size-4 text-error-foreground" />
						Preview failed
					</>
				)}
			</div>
			{isSuccess && data ? (
				<EffectsPreview
					output={data}
					bytes={bytes}
					analysis={analysis}
					isAnalysisLoading={isAnalysisLoading}
					analysisError={analysisError}
				/>
			) : (
				<div className="flex flex-col gap-3">
					<IntentSummary
						analysis={analysis}
						isLoading={isAnalysisLoading}
						error={analysisError}
					/>
					<p className="text-13 whitespace-pre-wrap text-error-foreground">
						{decodeURIComponent(
							error?.message ||
								'Transaction would fail on-chain',
						)}
					</p>
					<Alert variant="warning">
						Make sure the network next to the input matches
						the transaction.
					</Alert>
				</div>
			)}
		</div>
	);
}

function SignedResultDisplay({
	result,
	onStartOver,
	network,
}: {
	result: SignedResult;
	onStartOver: () => void;
	network: string;
}) {
	const explorerUrl = result.digest
		? getExplorerUrl(result.digest, network)
		: null;
	return (
		<div
			className="flex flex-col gap-4 rounded-lg border border-success-border bg-surface p-4"
			data-testid="signed-result"
			data-digest={result.digest}
			data-signature={result.signature}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 text-14 font-medium">
					<Check
						strokeWidth={3}
						className="size-4 text-success-foreground"
					/>
					{result.digest
						? 'Transaction signed and executed'
						: 'Transaction signed'}
				</div>
				<Button
					type="button"
					onClick={onStartOver}
					variant="outline"
					size="sm"
					data-testid="start-over-button"
				>
					Start over
				</Button>
			</div>
			<FieldDisplay
				label={
					result.digest ? 'Transaction digest' : 'Signature'
				}
				value={result.digest || result.signature}
			/>
			{explorerUrl && (
				<div>
					<a
						href={explorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						className={buttonVariants({
							variant: 'outline',
							size: 'sm',
						})}
					>
						<ExternalLink />
						View on explorer
					</a>
				</div>
			)}
		</div>
	);
}

function SignButton({
	onSign,
	isSigning,
	shouldExecute,
	disabled,
}: {
	onSign: (shouldExecute: boolean) => void;
	isSigning: boolean;
	shouldExecute: boolean;
	disabled?: boolean;
}) {
	return (
		<Button
			type="button"
			onClick={() => onSign(shouldExecute)}
			disabled={isSigning || disabled}
			variant={shouldExecute ? 'default' : 'outline'}
			data-testid={
				shouldExecute
					? 'sign-and-execute-button'
					: 'sign-button'
			}
		>
			{isSigning
				? 'Signing…'
				: shouldExecute
					? 'Sign and execute'
					: 'Sign only'}
		</Button>
	);
}

export default function SigningTool() {
	const [signedResult, setSignedResult] =
		useState<SignedResult | null>(null);
	const [transactionData, setTransactionData] =
		useState('');
	const [isSigning, setIsSigning] = useState(false);
	const [isSigningAndExecuting, setIsSigningAndExecuting] =
		useState(false);

	const network = useCurrentNetwork();
	const dappKit = useDAppKit();
	const currentAccount = useCurrentAccount();

	const {
		dryRun,
		analysis,
		preview,
		reset: resetPreview,
	} = useTransactionPreview();

	const isDryRunSuccessful =
		dryRun.isSuccess &&
		dryRun.data?.Transaction?.effects.status.success;

	useEffect(() => {
		resetPreview();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [network]);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (transactionData.trim()) {
				preview(transactionData);
			}
		}, 250);

		return () => clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transactionData, network]);

	const handleTransactionDataChange = (value: string) => {
		setTransactionData(value);
		if (
			analysis.data ||
			analysis.error ||
			dryRun.data ||
			dryRun.error
		) {
			resetPreview();
		}
		if (signedResult) {
			setSignedResult(null);
		}
	};

	const handleSign = async (shouldExecute: boolean) => {
		if (!transactionData) return;

		try {
			const tx = Transaction.from(transactionData);

			if (shouldExecute) {
				setIsSigningAndExecuting(true);
				const result =
					await dappKit.signAndExecuteTransaction({
						transaction: tx,
					});

				const txResult =
					result.Transaction ?? result.FailedTransaction;

				setSignedResult({
					digest: txResult?.digest,
					signature: txResult?.signatures[0] ?? '',
					bytes: transactionData,
				});
			} else {
				setIsSigning(true);
				const result = await dappKit.signTransaction({
					transaction: tx,
				});

				setSignedResult({
					digest: undefined,
					signature: result.signature,
					bytes: result.bytes,
				});
			}
		} catch {
			// Error handled by mutation
		} finally {
			setIsSigning(false);
			setIsSigningAndExecuting(false);
		}
	};

	const handleStartOver = () => {
		setSignedResult(null);
		setTransactionData('');
		resetPreview();
	};

	return (
		<div className="flex flex-col gap-6">
			{!signedResult && (
				<TransactionInput
					value={transactionData}
					onChange={handleTransactionDataChange}
				/>
			)}

			{!signedResult &&
				(dryRun.isPending ||
					dryRun.data ||
					dryRun.error) && (
					<PreviewResult
						isSuccess={isDryRunSuccessful}
						data={dryRun.data}
						error={dryRun.error}
						isLoading={dryRun.isPending}
						bytes={transactionData}
						analysis={analysis.data}
						isAnalysisLoading={analysis.isPending}
						analysisError={analysis.error}
					/>
				)}

			{signedResult && (
				<SignedResultDisplay
					result={signedResult}
					onStartOver={handleStartOver}
					network={network}
				/>
			)}

			{isDryRunSuccessful && !signedResult && (
				<div className="flex flex-col gap-3 border-t pt-4">
					{!currentAccount && (
						<Alert>
							Connect a wallet to sign this transaction.
						</Alert>
					)}
					<div className="flex justify-end gap-2">
						<SignButton
							onSign={handleSign}
							shouldExecute={false}
							isSigning={isSigning}
							disabled={!currentAccount}
						/>
						<SignButton
							onSign={handleSign}
							shouldExecute={true}
							isSigning={isSigningAndExecuting}
							disabled={!currentAccount}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
