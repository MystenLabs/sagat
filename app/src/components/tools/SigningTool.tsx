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
	formatAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import { PenLine, Send } from 'lucide-react';
import { useEffect, useState } from 'react';

import { EffectsPreview } from '@/components/preview-effects/EffectsPreview';
import { IntentSummary } from '@/components/preview-effects/IntentSummary';
import { Alert } from '@/components/ui/Alert';
import {
	Button,
	disabledButton,
} from '@/components/ui/button';
import {
	Skeleton,
	SkeletonLine,
} from '@/components/ui/skeleton';
import { type TransactionAnalysis } from '@/hooks/useTransactionAnalysis';
import { useTransactionPreview } from '@/hooks/useTransactionPreview';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import { toast } from '@/lib/toast';
import {
	errorMessage,
	getExplorerUrl,
	safeDecode,
} from '@/lib/utils';

import {
	BytesField,
	NetworkField,
	ReadOnlyField,
	ResultActions,
	ToolActions,
	ToolCard,
} from './parts';

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
	/** The network it was signed on, for the explorer link. */
	network: string;
	/** Set when the transaction executed but failed on chain. */
	failure?: { message: string };
}

const CANT_READ =
	'Can’t read this as a transaction. Paste the full data as JSON or base64, and check the network above.';

/** The transaction's sender, normalised, or null when it names none. */
function senderOf(transactionData: string): string | null {
	const sender =
		Transaction.from(transactionData).getData().sender;
	return sender ? normalizeSuiAddress(sender) : null;
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
				aria-busy
				className="flex flex-col gap-3"
				data-testid="transaction-preview-loading"
			>
				<span className="sr-only">
					Previewing transaction…
				</span>
				<div className="flex flex-col gap-3 rounded-lg border bg-surface p-4">
					<SkeletonLine className="w-48" />
					<div className="flex flex-col gap-2">
						<SkeletonLine className="w-3/4" />
						<SkeletonLine className="w-3/4" />
						<SkeletonLine className="w-1/4" />
					</div>
					<Skeleton className="h-8 w-full rounded-md" />
				</div>
			</div>
		);
	}

	return (
		<div
			className="flex flex-col gap-3"
			data-testid="transaction-preview-result"
			data-result={isSuccess ? 'success' : 'failure'}
		>
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
						{safeDecode(
							error?.message ||
								'Transaction would fail on-chain',
						)}
					</p>
					<Alert variant="warning">
						Make sure the network above matches the
						transaction.
					</Alert>
				</div>
			)}
		</div>
	);
}

function SignedResultDisplay({
	result,
	onStartOver,
}: {
	result: SignedResult;
	onStartOver: () => void;
}) {
	const { digest, failure, signature, network } = result;
	const explorerUrl = digest
		? getExplorerUrl(digest, network)
		: null;

	return (
		<div
			className="flex flex-col gap-5"
			data-testid="signed-result"
			data-result={failure ? 'failure' : 'success'}
			data-signature={signature}
			data-digest={digest || undefined}
		>
			{failure ? (
				<Alert variant="error">
					Transaction failed:{' '}
					<span
						className="whitespace-pre-wrap"
						data-testid="signed-result-error"
					>
						{safeDecode(failure.message)}
					</span>
				</Alert>
			) : (
				<Alert variant="success">
					{digest
						? 'Executed. The network accepted this transaction.'
						: 'Signed. Copy the signature and share it with the other signers.'}
				</Alert>
			)}
			{digest ? (
				<ReadOnlyField
					label="Transaction digest"
					value={digest}
				/>
			) : (
				<ReadOnlyField
					label="Signature"
					value={signature}
				/>
			)}
			<ResultActions
				onReset={onStartOver}
				resetLabel="Start over"
				resetTestId="start-over-button"
				explorerUrl={explorerUrl}
				copyValue={digest ?? signature}
				copyLabel={
					digest ? 'Copy digest' : 'Copy signature'
				}
				copyMessage={
					digest ? 'Digest copied' : 'Signature copied'
				}
			/>
		</div>
	);
}

export default function SigningTool() {
	const [signedResult, setSignedResult] =
		useState<SignedResult | null>(null);
	const [transactionData, setTransactionData] =
		useState('');
	const [unreadable, setUnreadable] = useState(false);
	const [sender, setSender] = useState<string | null>(null);
	const [isSigning, setIsSigning] = useState(false);
	const [isSigningAndExecuting, setIsSigningAndExecuting] =
		useState(false);
	const isSignPending = isSigning || isSigningAndExecuting;

	const network = useCurrentNetwork();
	const dappKit = useDAppKit();
	const currentAccount = useCurrentAccount();
	const { data: multisigs } = useUserMultisigs();

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
			if (!transactionData.trim()) return;
			// Data the SDK can't read never reaches the dry run.
			try {
				setSender(senderOf(transactionData));
			} catch {
				setUnreadable(true);
				return;
			}
			preview(transactionData);
		}, 250);

		return () => clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transactionData, network]);

	const handleTransactionDataChange = (value: string) => {
		setTransactionData(value);
		setUnreadable(false);
		setSender(null);
		if (
			analysis.data ||
			analysis.error ||
			dryRun.data ||
			dryRun.error
		) {
			resetPreview();
		}
	};

	const handleSign = async (shouldExecute: boolean) => {
		if (!transactionData || isSignPending) return;

		const signedOn = network;
		try {
			const tx = Transaction.from(transactionData);

			if (shouldExecute) {
				setIsSigningAndExecuting(true);
				const result =
					await dappKit.signAndExecuteTransaction({
						transaction: tx,
					});

				const failed = result.FailedTransaction;
				const txResult = result.Transaction ?? failed;

				setSignedResult({
					digest: txResult?.digest,
					signature: txResult?.signatures[0] ?? '',
					bytes: transactionData,
					network: signedOn,
					failure: failed
						? {
								message:
									failed.effects?.status.error?.message ||
									'The transaction failed on chain.',
							}
						: undefined,
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
					network: signedOn,
				});
			}
		} catch (error) {
			// The input stays, so the user can retry.
			toast.error(
				errorMessage(
					error,
					'Failed to sign the transaction',
				),
			);
		} finally {
			setIsSigning(false);
			setIsSigningAndExecuting(false);
		}
	};

	const handleStartOver = () => {
		setSignedResult(null);
		setTransactionData('');
		setUnreadable(false);
		setSender(null);
		resetPreview();
	};

	// A sender other than the wallet needs more signatures than this one,
	// so the transaction can only be signed here, not executed.
	const foreignSender =
		!!currentAccount &&
		!!sender &&
		sender !== normalizeSuiAddress(currentAccount.address);
	const senderMultisig = foreignSender
		? multisigs?.find(
				(multisig) =>
					normalizeSuiAddress(multisig.address) === sender,
			)
		: undefined;

	let signNote: string | undefined;
	if (!currentAccount) {
		signNote = 'Connect a wallet to sign this transaction.';
	} else if (senderMultisig) {
		signNote = `${senderMultisig.name || formatAddress(senderMultisig.address)}’s threshold is ${senderMultisig.threshold} of ${senderMultisig.totalWeight}, so it can’t run on your signature alone. Sign to add yours.`;
	} else if (foreignSender) {
		signNote =
			'The sender isn’t your connected wallet, so this can’t run on your signature alone. Sign to add yours.';
	}

	const showPreview =
		!signedResult &&
		!unreadable &&
		(dryRun.isPending || dryRun.data || dryRun.error);

	return (
		<ToolCard>
			<NetworkField />
			<BytesField
				id="transaction-data"
				label="Transaction data"
				testId="transaction-data-input"
				placeholder="Paste the transaction data (JSON or base64)"
				minHeight="min-h-40"
				value={transactionData}
				onChange={handleTransactionDataChange}
				readOnly={!!signedResult || isSignPending}
				error={unreadable ? CANT_READ : undefined}
				errorTestId="transaction-data-error"
			/>

			{showPreview && (
				<section className="flex flex-col gap-3">
					<h2 className="text-16 font-medium">
						Transaction preview
					</h2>
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
				</section>
			)}

			{signedResult && (
				<SignedResultDisplay
					result={signedResult}
					onStartOver={handleStartOver}
				/>
			)}

			{isDryRunSuccessful &&
				!signedResult &&
				!unreadable && (
					<ToolActions
						note={signNote}
						noteTestId="sign-note"
					>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleSign(true)}
							disabled={
								!currentAccount ||
								foreignSender ||
								isSignPending
							}
							className={disabledButton}
							data-testid="sign-and-execute-button"
						>
							<Send />
							{isSigningAndExecuting
								? 'Signing…'
								: 'Sign and execute'}
						</Button>
						<Button
							type="button"
							onClick={() => handleSign(false)}
							disabled={!currentAccount || isSignPending}
							className={disabledButton}
							data-testid="sign-button"
						>
							<PenLine />
							{isSigning ? 'Signing…' : 'Sign'}
						</Button>
					</ToolActions>
				)}
		</ToolCard>
	);
}
