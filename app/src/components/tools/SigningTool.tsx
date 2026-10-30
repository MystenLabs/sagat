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
import {
	normalizeSuiAddress,
	toBase64,
} from '@mysten/sui/utils';
import { PenLine, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
	disabledButton,
} from '@/components/ui/button';
import { CardHeading } from '@/components/ui/card';
import { SkeletonLine } from '@/components/ui/skeleton';
import { content } from '@/content';
import { type useTransactionAnalysis } from '@/hooks/useTransactionAnalysis';
import { useTransactionPreview } from '@/hooks/useTransactionPreview';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import { accountName } from '@/lib/account-name';
import { thresholdLabel } from '@/lib/threshold';
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

interface SignedResult {
	digest?: string;
	signature: string;
	bytes: string;
	/** The network it was signed on, for the explorer link. */
	network: string;
	/** Set when the transaction executed but failed on chain. */
	failure?: { message: string };
}

/** The transaction's sender, normalised, or null when it names none. */
function senderOf(transactionData: string): string | null {
	const sender =
		Transaction.from(transactionData).getData().sender;
	return sender ? normalizeSuiAddress(sender) : null;
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
		{content.tools.sign.networkWarning}
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
	// The block marks its own result and carries its own heading; without
	// it, this wrapper does.
	const withBlock = !!(simulation && bytes);
	const settledWithoutBlock = !pending && !withBlock;
	// One tree for pending and settled, so the preview keeps its tab when
	// the simulation lands.
	return (
		<section className="flex flex-col gap-3">
			{!withBlock && (
				<CardHeading
					title={content.tools.sign.previewTitle}
				/>
			)}
			{/* Without the preview block, the analyzer shows on its own. */}
			{settledWithoutBlock && analyzer}
			<div
				className="flex flex-col gap-3"
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
						{content.tools.sign.previewing}
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
							dryRunError || content.tools.sign.wouldFail,
						)}
					</p>
				)}
				{!pending && !passed && networkWarning}
			</div>
		</section>
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
					{content.tools.sign.failedPrefix}{' '}
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
						? content.tools.sign.executed
						: content.tools.sign.signed}
				</Alert>
			)}
			{digest ? (
				<ReadOnlyField
					label={content.tools.transactionDigest}
					value={digest}
				/>
			) : (
				<ReadOnlyField
					label={content.tools.sign.signatureLabel}
					value={signature}
				/>
			)}
			<ResultActions
				onReset={onStartOver}
				resetLabel={content.tools.sign.startOver}
				resetTestId="start-over-button"
				explorerUrl={explorerUrl}
				copyValue={digest ?? signature}
				copyLabel={
					digest
						? content.tools.copyDigest
						: content.tools.sign.copySignature
				}
				copyMessage={
					digest
						? content.toasts.digestCopied
						: content.toasts.signatureCopied
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
		// Drops a run still in flight too, so its result can't land on the
		// edited data.
		resetPreview();
	};

	const handleSign = async (shouldExecute: boolean) => {
		if (!bytes || isSignPending) return;

		const signedOn = network;
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
					network: signedOn,
					failure: failed
						? {
								message:
									failed.effects?.status.error?.message ||
									content.tools.sign.failedOnChain,
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
				errorMessage(error, content.toasts.signFailed),
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
		signNote = content.tools.sign.connectWallet;
	} else if (senderMultisig) {
		signNote = content.tools.sign.thresholdNote(
			accountName(senderMultisig),
			thresholdLabel(senderMultisig),
		);
	} else if (foreignSender) {
		signNote = content.tools.sign.foreignSender;
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
				label={content.tools.sign.dataLabel}
				testId="transaction-data-input"
				placeholder={content.tools.sign.dataPlaceholder}
				minHeight="min-h-40"
				value={transactionData}
				onChange={handleTransactionDataChange}
				readOnly={!!signedResult || isSignPending}
				error={
					unreadable
						? content.tools.sign.unreadable
						: undefined
				}
				errorTestId="transaction-data-error"
			/>

			{showPreview && (
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
								? content.tools.sign.signing
								: content.tools.sign.signAndExecute}
						</Button>
						<Button
							type="button"
							onClick={() => handleSign(false)}
							disabled={!currentAccount || isSignPending}
							className={disabledButton}
							data-testid="sign-button"
						>
							<PenLine />
							{isSigning
								? content.tools.sign.signing
								: content.tools.sign.sign}
						</Button>
					</ToolActions>
				)}
		</ToolCard>
	);
}
