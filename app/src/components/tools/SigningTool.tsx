// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import type { SuiClientTypes } from '@mysten/sui/client';
import {
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import {
	AlertCircle,
	Check,
	ExternalLink,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { NetworkSelector } from '@/components/NetworkSelector';
import { analyzerTab } from '@/components/preview-effects/IntentSummary';
import {
	pendingSimulation,
	simulationProps,
	type SimulationProps,
} from '@/components/transaction-preview/simulation';
import { TransactionPreview } from '@/components/transaction-preview/TransactionPreview';
import { Alert } from '@/components/ui/Alert';
import {
	Button,
	buttonVariants,
} from '@/components/ui/button';
import { FieldDisplay } from '@/components/ui/FieldDisplay';
import { Label } from '@/components/ui/label';
import { SkeletonLine } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { type useTransactionAnalysis } from '@/hooks/useTransactionAnalysis';
import { useTransactionPreview } from '@/hooks/useTransactionPreview';
import { toast } from '@/lib/toast';
import {
	cn,
	errorMessage,
	getExplorerUrl,
	safeDecode,
} from '@/lib/utils';

interface SignedResult {
	digest?: string;
	signature: string;
	bytes: string;
	/** Set when the transaction executed but failed on chain. */
	failure?: { message: string };
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

/**
 * The input as base64 transaction bytes for the preview, which are also
 * the bytes signed. Bytes stay as pasted. JSON is built offline only when
 * it is fully resolved, since then the dry run builds it without the
 * resolver and so to the same bytes; otherwise the resolver may still set
 * fields (gas, or the expiration an address-balance gas payment needs),
 * so these are the bytes of the transaction the dry run of this input
 * simulated, which is only there once it settled. Null until then, or
 * when none of these work.
 */
function previewBytes(
	input: string,
	simulated?: SuiClientTypes.TransactionData,
): string | null {
	const trimmed = input.trim();
	try {
		if (!trimmed.startsWith('{')) {
			Transaction.from(trimmed);
			return trimmed;
		}
		if (simulated) {
			return toBase64(
				TransactionDataBuilder.restore(simulated).build(),
			);
		}
		const tx = Transaction.from(trimmed);
		if (!tx.isFullyResolved()) return null;
		return toBase64(
			TransactionDataBuilder.restore(tx.getData()).build(),
		);
	} catch {
		return null;
	}
}

const networkWarning = (
	<Alert variant="warning">
		Make sure the network next to the input matches the
		transaction.
	</Alert>
);

function PreviewResult({
	simulation,
	dryRunError,
	bytes,
	analysis,
}: {
	/** The current input's simulation (see `simulationProps`). */
	simulation: SimulationProps | null;
	/** Why the current input's dry run failed, if it did. */
	dryRunError?: string;
	/** The bytes the preview shows (see `previewBytes`), also what is signed. */
	bytes: string | null;
	analysis: ReturnType<typeof useTransactionAnalysis>;
}) {
	const { analyzer, analyzerCount } = analyzerTab(analysis);

	const pending = simulation?.status === 'pending';
	const passed = simulation?.status === 'passed';
	// The block marks its own result; without it, this wrapper does.
	const withBlock = !!(simulation && bytes);
	const settledWithoutBlock = !pending && !withBlock;
	// One tree for pending and settled, so the preview keeps its tab when
	// the simulation lands.
	return (
		<div className="flex flex-col gap-4">
			{/* Without the preview block, the analyzer shows on its own. */}
			{settledWithoutBlock && analyzer}
			<div
				className="flex flex-col gap-4"
				data-testid={
					settledWithoutBlock
						? 'transaction-preview-result'
						: undefined
				}
				data-result={
					settledWithoutBlock
						? passed
							? 'success'
							: 'failure'
						: undefined
				}
			>
				{pending && (
					<span className="sr-only" role="status">
						Previewing transaction…
					</span>
				)}
				{withBlock ? (
					<TransactionPreview
						bytes={bytes}
						analyzer={analyzer}
						analyzerCount={analyzerCount}
						{...simulation}
					/>
				) : pending ? (
					<div className="flex flex-col gap-3 rounded-lg border p-4">
						<SkeletonLine className="w-48" />
						<SkeletonLine className="w-3/4" />
						<SkeletonLine className="w-1/4" />
					</div>
				) : (
					<p className="text-13 whitespace-pre-wrap text-error-foreground">
						{safeDecode(
							dryRunError ||
								'Transaction would fail on-chain',
						)}
					</p>
				)}
				{!pending && !passed && networkWarning}
			</div>
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
	const failed = !!result.failure;
	const explorerUrl = result.digest
		? getExplorerUrl(result.digest, network)
		: null;

	return (
		<div
			className={cn(
				'flex flex-col gap-4 rounded-lg border bg-surface p-4',
				failed
					? 'border-error-border'
					: 'border-success-border',
			)}
			data-testid="signed-result"
			data-result={failed ? 'failure' : 'success'}
			data-digest={result.digest}
			data-signature={result.signature}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 text-14 font-medium">
					{failed ? (
						<>
							<AlertCircle className="size-4 text-error-foreground" />
							Transaction failed
						</>
					) : (
						<>
							<Check
								strokeWidth={3}
								className="size-4 text-success-foreground"
							/>
							{result.digest
								? 'Transaction signed and executed'
								: 'Transaction signed'}
						</>
					)}
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
			{result.failure && (
				<p
					className="text-13 whitespace-pre-wrap text-error-foreground"
					data-testid="signed-result-error"
				>
					{safeDecode(result.failure.message)}
				</p>
			)}
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
	const isSignPending = isSigning || isSigningAndExecuting;

	const network = useCurrentNetwork();
	const dappKit = useDAppKit();
	const currentAccount = useCurrentAccount();

	const {
		dryRun,
		analysis,
		preview,
		reset: resetPreview,
	} = useTransactionPreview();

	// A dry run of an earlier input counts as pending, so its result never
	// stands in for this input's.
	const current = dryRun.variables === transactionData;
	const simulation = current
		? simulationProps(dryRun)
		: pendingSimulation;
	const simulated = simulation?.result?.transaction;

	// What the preview shows and what is signed, so the digest and Ledger
	// hash the user checked are those of the signed bytes.
	const bytes = useMemo(
		() => previewBytes(transactionData, simulated),
		[transactionData, simulated],
	);

	const isDryRunSuccessful =
		simulation?.status === 'passed';

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
		resetPreview();
		if (signedResult) {
			setSignedResult(null);
		}
	};

	const handleSign = async (shouldExecute: boolean) => {
		if (!bytes || isSignPending) return;

		try {
			const tx = Transaction.from(bytes);

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
					bytes,
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
						simulation={simulation}
						dryRunError={
							current ? dryRun.error?.message : undefined
						}
						bytes={bytes}
						analysis={analysis}
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
							disabled={!currentAccount || isSignPending}
						/>
						<SignButton
							onSign={handleSign}
							shouldExecute={true}
							isSigning={isSigningAndExecuting}
							disabled={!currentAccount || isSignPending}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
