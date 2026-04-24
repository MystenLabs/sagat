// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { zodResolver } from '@hookform/resolvers/zod';
import {
	AlertCircle,
	Check,
	ChevronDown,
	ChevronRight,
	Code2,
	Eye,
	Send,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod/v3';

import { useNetwork } from '../contexts/NetworkContext';
import { useCoinMetadataMap } from '../hooks/useCoinMetadata';
import { useCreateProposal } from '../hooks/useCreateProposal';
import { useDryRun } from '../hooks/useDryRun';
import { useMultisigBalances } from '../hooks/useMultisigBalances';
import {
	TransferForm,
	type PreparedTransfer,
} from './assets/TransferForm';
import { EffectsPreview } from './preview-effects/EffectsPreview';
import { Button } from './ui/button';
import { Label } from './ui/label';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from './ui/sheet';
import { Tabs } from './ui/tabs';

export type ProposalIntent =
	| { kind: 'custom' }
	| { kind: 'transfer'; coinType?: string | null };

interface ProposalSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	multisigAddress: string;
	/**
	 * What the user is trying to do. Defaults to opening the
	 * fully-custom transaction view.
	 *
	 * - `{ kind: 'custom' }`: classic JSON / base64 paste flow.
	 * - `{ kind: 'transfer', coinType? }`: structured transfer form,
	 *   optionally pre-selecting an asset (when launched from a
	 *   specific row's "Send" button).
	 *
	 * Read once at mount; the parent should null this on close so that
	 * the next open starts from a fresh, intent-driven default.
	 */
	intent?: ProposalIntent | null;
}

type Mode = 'transfer' | 'custom';

const proposalSchema = z.object({
	description: z.string().optional(),
	transactionData: z
		.string()
		.min(1, 'Transaction data is required')
		.refine((data) => {
			try {
				JSON.parse(data);
				return true;
			} catch {
				try {
					atob(data);
					return true;
				} catch {
					return false;
				}
			}
		}, 'Must be valid JSON or base64'),
});

type ProposalFormData = z.infer<typeof proposalSchema>;

/**
 * Outer wrapper: owns only the sheet shell and lifetime of the body.
 *
 * Mounting `ProposalSheetBody` only while `open === true` means every
 * open() starts with a fresh form, fresh mutations, and fresh
 * `intent`-derived defaults — no apply-once effects or refs needed.
 */
export function ProposalSheet({
	open,
	onOpenChange,
	multisigAddress,
	intent,
}: ProposalSheetProps) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-full! sm:w-[70vw]! max-w-none! px-4 sm:px-8 pt-6 overflow-y-auto">
				{open && (
					<ProposalSheetBody
						multisigAddress={multisigAddress}
						intent={intent}
						onClose={() => onOpenChange(false)}
					/>
				)}
			</SheetContent>
		</Sheet>
	);
}

interface ProposalSheetBodyProps {
	multisigAddress: string;
	intent: ProposalIntent | null | undefined;
	onClose: () => void;
}

function ProposalSheetBody({
	multisigAddress,
	intent,
	onClose,
}: ProposalSheetBodyProps) {
	const { network } = useNetwork();

	const form = useForm<ProposalFormData>({
		resolver: zodResolver(proposalSchema),
		defaultValues: { description: '', transactionData: '' },
	});
	const { handleSubmit, control } = form;

	const dryRunMutation = useDryRun();
	const createProposalMutation = useCreateProposal();

	// Mode is seeded from the launching `intent` once, at mount. The
	// parent re-mounts us on every open(), so we never need an effect
	// to react to `intent` changing while open.
	const [mode, setMode] = useState<Mode>(() =>
		intent?.kind === 'transfer' ? 'transfer' : 'custom',
	);
	const [showRawTransaction, setShowRawTransaction] =
		useState(false);

	// Balances + metadata for the transfer-mode asset picker. Keyed by
	// network/address inside the hooks, and cached aggressively, so
	// opening the sheet from the Assets tab is free.
	const balancesQuery = useMultisigBalances(
		mode === 'transfer' ? multisigAddress : undefined,
	);
	const coinTypes = useMemo(
		() => balancesQuery.balances.map((b) => b.coinType),
		[balancesQuery.balances],
	);
	const { map: metadataMap } =
		useCoinMetadataMap(coinTypes);

	const isDryRunSuccessful =
		dryRunMutation.isSuccess &&
		dryRunMutation.data?.result?.Transaction?.effects.status
			.success;

	const onFormSubmit = (event: React.FormEvent) =>
		handleSubmit((data) => {
			if (!isDryRunSuccessful || !dryRunMutation.data?.bytes)
				return;
			createProposalMutation.mutate(
				{
					multisigAddress,
					transactionBytes: dryRunMutation.data.bytes,
					description: data.description,
				},
				{ onSuccess: onClose },
			);
		})(event);

	const handleCustomPreview = () => {
		const transactionData = form.getValues(
			'transactionData',
		);
		if (transactionData)
			dryRunMutation.mutate(transactionData);
	};

	const handleCustomTransactionDataChange = () => {
		if (dryRunMutation.data || dryRunMutation.error) {
			dryRunMutation.reset();
		}
		if (createProposalMutation.error) {
			createProposalMutation.reset();
		}
	};

	const handleTransferPrepared = useCallback(
		(prepared: PreparedTransfer) => {
			form.setValue(
				'transactionData',
				prepared.transactionData,
				{ shouldValidate: true },
			);
			dryRunMutation.reset();
			createProposalMutation.reset();
			dryRunMutation.mutate(prepared.transactionData);
		},
		[createProposalMutation, dryRunMutation, form],
	);

	const handleTransferReset = useCallback(() => {
		form.setValue('transactionData', '');
		dryRunMutation.reset();
		createProposalMutation.reset();
	}, [createProposalMutation, dryRunMutation, form]);

	const transactionData = useWatch({
		control,
		name: 'transactionData',
	});

	const initialTransferCoinType =
		intent?.kind === 'transfer' ? intent.coinType : null;

	return (
		<>
			<SheetHeader className="p-0 pr-12">
				<div className="flex items-center justify-between gap-4">
					<div className="min-w-0">
						<SheetTitle>Create New Proposal</SheetTitle>
						<SheetDescription>
							Choose how you want to build this proposal.
							The multisig signers can review and vote on it
							once submitted.
						</SheetDescription>
					</div>
					<Label
						variant={
							network === 'testnet' ? 'warning' : 'info'
						}
					>
						{network}
					</Label>
				</div>
			</SheetHeader>

			<div className="mt-6">
				<Tabs
					tabs={[
						{
							id: 'transfer',
							label: 'Transfer',
							icon: <Send className="w-4 h-4" />,
						},
						{
							id: 'custom',
							label: 'Custom transaction',
							icon: <Code2 className="w-4 h-4" />,
						},
					]}
					activeTab={mode}
					onTabChange={(next) => {
						const nextMode = next as Mode;
						if (nextMode === mode) return;
						setMode(nextMode);
						setShowRawTransaction(false);
						form.reset({
							description: '',
							transactionData: '',
						});
						dryRunMutation.reset();
						createProposalMutation.reset();
					}}
				/>
			</div>

			<form
				onSubmit={onFormSubmit}
				className="space-y-8 mt-6 pb-8"
			>
				{mode === 'transfer' ? (
					<>
						<TransferForm
							multisigAddress={multisigAddress}
							balances={balancesQuery.balances}
							metadataMap={metadataMap}
							isLoadingBalances={balancesQuery.isLoading}
							initialCoinType={initialTransferCoinType}
							isPreviewing={dryRunMutation.isPending}
							onPrepare={handleTransferPrepared}
							onReset={handleTransferReset}
						/>

						{transactionData && (
							<div className="space-y-2">
								<button
									type="button"
									onClick={() =>
										setShowRawTransaction((v) => !v)
									}
									className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
								>
									{showRawTransaction ? (
										<ChevronDown className="w-3.5 h-3.5" />
									) : (
										<ChevronRight className="w-3.5 h-3.5" />
									)}
									{showRawTransaction
										? 'Hide raw transaction'
										: 'View raw transaction'}
								</button>
								{showRawTransaction && (
									<textarea
										readOnly
										value={transactionData}
										rows={8}
										className="w-full px-3 py-2 border border-border rounded-md bg-muted resize-none font-mono text-xs text-muted-foreground"
									/>
								)}
							</div>
						)}
					</>
				) : (
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<label
								htmlFor="transaction-data"
								className="text-sm font-medium text-muted-foreground"
							>
								Transaction Data (JSON or base64)
							</label>
							{transactionData && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleCustomPreview}
									disabled={
										dryRunMutation.isPending ||
										!transactionData
									}
								>
									<Eye className="w-4 h-4 mr-1" />
									{dryRunMutation.isPending
										? 'Previewing...'
										: 'Preview Effects'}
								</Button>
							)}
						</div>
						<textarea
							id="transaction-data"
							placeholder="Enter transaction data in JSON format or base64..."
							{...form.register('transactionData', {
								onChange: handleCustomTransactionDataChange,
							})}
							rows={dryRunMutation.data ? 6 : 12}
							className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none font-mono text-sm"
						/>
						{form.formState.errors.transactionData && (
							<p className="text-sm text-error-foreground">
								{
									form.formState.errors.transactionData
										.message
								}
							</p>
						)}
					</div>
				)}

				{dryRunMutation.isPending && (
					<div className="py-2">
						<div className="flex items-center gap-2 mb-3">
							<Eye className="w-5 h-5 text-muted-foreground animate-pulse" />
							<h3 className="font-medium text-foreground">
								Previewing transaction…
							</h3>
						</div>
						<p className="text-sm text-muted-foreground">
							Simulating the transaction on-chain to check
							it would succeed.
						</p>
					</div>
				)}

				{!dryRunMutation.isPending &&
					(dryRunMutation.data || dryRunMutation.error) && (
						<div className="py-2">
							<div className="flex items-center gap-2 mb-3">
								{isDryRunSuccessful ? (
									<>
										<Check
											strokeWidth={3}
											className="w-4 h-4 text-success-foreground"
										/>
										<h3 className="font-medium text-foreground">
											Transaction Preview - Success
										</h3>
									</>
								) : (
									<>
										<AlertCircle className="w-5 h-5 text-error-foreground" />
										<h3 className="font-medium text-foreground">
											Transaction Preview - Failed
										</h3>
									</>
								)}
							</div>
							{isDryRunSuccessful ? (
								<EffectsPreview
									output={dryRunMutation.data.result}
									bytes={dryRunMutation.data.bytes}
								/>
							) : (
								<p className="text-sm text-error-foreground">
									{decodeURIComponent(
										dryRunMutation.error?.message ||
											'Transaction would fail on-chain',
									)}
								</p>
							)}
						</div>
					)}

				{createProposalMutation.error && (
					<div className="border border-error-border bg-card rounded-lg p-4">
						<div className="flex items-center gap-2 mb-3">
							<AlertCircle className="w-5 h-5 text-error-foreground" />
							<h3 className="font-medium text-foreground">
								Failed to Create Proposal
							</h3>
						</div>
						<p className="text-sm text-error-foreground">
							{createProposalMutation.error.message}
						</p>
					</div>
				)}

				<div className="space-y-2">
					<label
						htmlFor="description"
						className="text-sm text-muted-foreground"
					>
						Description (optional)
					</label>
					<textarea
						id="description"
						placeholder="Optional description for this proposal..."
						{...form.register('description')}
						rows={2}
						className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
					/>
					{form.formState.errors.description && (
						<p className="text-sm text-error-foreground">
							{form.formState.errors.description.message}
						</p>
					)}
				</div>

				<div className="flex justify-end space-x-3 pt-4 border-t">
					<Button
						type="button"
						variant="outline"
						onClick={onClose}
					>
						Cancel
					</Button>
					{!dryRunMutation.data ? (
						<Button
							type="button"
							disabled
							variant="outline"
						>
							Preview Required
						</Button>
					) : isDryRunSuccessful ? (
						<Button
							type="submit"
							disabled={createProposalMutation.isPending}
							variant="default"
						>
							{createProposalMutation.isPending
								? 'Creating...'
								: 'Create Proposal'}
						</Button>
					) : (
						<Button
							type="button"
							disabled
							variant="destructive"
						>
							Fix Transaction Errors
						</Button>
					)}
				</div>
			</form>
		</>
	);
}
