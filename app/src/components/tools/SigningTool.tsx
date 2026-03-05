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
	CheckCircle,
	ExternalLink,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { NetworkSelector } from '@/components/LocalNetworkSelector';
import { EffectsPreview } from '@/components/preview-effects/EffectsPreview';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/button';
import { FieldDisplay } from '@/components/ui/FieldDisplay';
import { Textarea } from '@/components/ui/textarea';
import { useDryRun } from '@/hooks/useDryRun';
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
		<div className="space-y-2">
			<label
				htmlFor="transaction-data"
				className="text-sm font-medium text-gray-700"
			>
				Transaction Data (JSON or base64)
			</label>
			<Textarea
				id="transaction-data"
				placeholder="Enter transaction data in JSON format or base64..."
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={6}
				className="font-mono text-sm"
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
}: {
	isSuccess: boolean;
	data: SimulateResult | undefined;
	error: Error | null;
	isLoading: boolean;
	bytes?: string;
}) {
	if (isLoading) {
		return (
			<div className="border border-gray-200 bg-white rounded-lg p-4">
				<div className="flex items-center gap-2">
					<div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
					<h3 className="font-medium text-gray-900">
						Previewing transaction...
					</h3>
				</div>
			</div>
		);
	}

	return (
		<div
			className={`border rounded-lg p-4 ${
				isSuccess
					? 'border-green-200 bg-white'
					: 'border-red-200 bg-white'
			}`}
		>
			<div className="flex items-center gap-2 mb-3">
				{isSuccess ? (
					<>
						<CheckCircle className="w-5 h-5 text-green-600" />
						<h3 className="font-medium text-gray-900">
							Transaction Preview - Success
						</h3>
					</>
				) : (
					<>
						<AlertCircle className="w-5 h-5 text-red-600" />
						<h3 className="font-medium text-gray-900">
							Transaction Preview - Failed
						</h3>
					</>
				)}
			</div>
			{isSuccess && data ? (
				<EffectsPreview output={data} bytes={bytes} />
			) : (
				<div className="space-y-3">
					<p className="text-sm text-red-600 whitespace-pre-wrap">
						{decodeURIComponent(
							error?.message ||
								'Transaction would fail on-chain',
						)}
					</p>
					<Alert variant="warning">
						<span className="">
							Make sure you've selected the correct network
							above
						</span>
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
	return (
		<div className="border border-gray-200 bg-white rounded-lg p-4">
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					<CheckCircle className="w-5 h-5 text-green-600" />
					<h3 className="font-medium text-gray-900">
						Transaction{' '}
						{result.digest
							? 'Signed and Executed'
							: 'Signed'}{' '}
						Successfully
					</h3>
				</div>
				<Button
					type="button"
					onClick={onStartOver}
					variant="outline"
					size="sm"
				>
					Start Over
				</Button>
			</div>
			<div className="space-y-3">
				<FieldDisplay
					label={
						result.digest
							? 'Transaction Digest'
							: 'Signature'
					}
					value={result.digest || result.signature}
				/>
				{result.digest && (
					<Button size="sm" variant="outline" asChild>
						<a
							href={getExplorerUrl(result.digest, network)}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1"
						>
							<ExternalLink className="w-4 h-4" />
							View Transaction
						</a>
					</Button>
				)}
			</div>
		</div>
	);
}

function SignButton({
	onSign,
	isSigning,
	shouldExecute,
}: {
	onSign: (shouldExecute: boolean) => void;
	isSigning: boolean;
	shouldExecute: boolean;
}) {
	const currentAccount = useCurrentAccount();
	return (
		<>
			<div className="flex justify-end pt-4">
				<Button
					type="button"
					onClick={() => onSign(shouldExecute)}
					disabled={isSigning || !currentAccount}
					className={`${shouldExecute ? 'bg-primary hover:bg-primary/90' : 'bg-blue-600 hover:bg-blue-700'}`}
				>
					{isSigning
						? 'Signing...'
						: shouldExecute
							? 'Sign and Execute with Wallet'
							: 'Sign with Wallet'}
				</Button>
			</div>

			{!currentAccount && (
				<Alert>
					<span>
						No wallet connected. Connect a wallet to sign
						this transaction.
					</span>
				</Alert>
			)}
		</>
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

	const dryRunMutation = useDryRun();

	const isDryRunSuccessful =
		dryRunMutation.isSuccess &&
		dryRunMutation.data?.Transaction?.effects.status
			.success;

	useEffect(() => {
		dryRunMutation.reset();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [network]);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (transactionData.trim()) {
				dryRunMutation.mutate(transactionData);
			}
		}, 250);

		return () => clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transactionData, network]);

	const handleTransactionDataChange = (value: string) => {
		setTransactionData(value);
		if (dryRunMutation.data || dryRunMutation.error) {
			dryRunMutation.reset();
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
		dryRunMutation.reset();
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div>
					<p className="text-sm text-gray-600">
						Preview and sign transactions with your
						connected wallet.
					</p>
				</div>
				<NetworkSelector />
			</div>

			<div className="space-y-6">
				{!signedResult && (
					<TransactionInput
						value={transactionData}
						onChange={handleTransactionDataChange}
					/>
				)}

				{!signedResult &&
					(dryRunMutation.isPending ||
						dryRunMutation.data ||
						dryRunMutation.error) && (
						<PreviewResult
							isSuccess={isDryRunSuccessful}
							data={dryRunMutation.data}
							error={dryRunMutation.error}
							isLoading={dryRunMutation.isPending}
							bytes={transactionData}
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
					<div className="flex gap-2 justify-end">
						<SignButton
							onSign={handleSign}
							shouldExecute={true}
							isSigning={isSigningAndExecuting}
						/>
						<SignButton
							onSign={handleSign}
							shouldExecute={false}
							isSigning={isSigning}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
