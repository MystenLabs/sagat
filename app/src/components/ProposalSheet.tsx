import { zodResolver } from '@hookform/resolvers/zod';
import {
	AlertCircle,
	CheckCircle,
	Eye,
} from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useNetwork } from '../contexts/NetworkContext';
import { useCreateProposal } from '../hooks/useCreateProposal';
import { useDryRun } from '../hooks/useDryRun';
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

interface ProposalSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	multisigAddress: string;
}

const proposalSchema = z.object({
	description: z.string().optional(),
	transactionData: z
		.string()
		.min(1, 'Transaction data is required')
		.refine((data) => {
			try {
				// Try parsing as JSON first
				JSON.parse(data);
				return true;
			} catch {
				// If JSON parsing fails, check if it's a valid base64 string
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

export function ProposalSheet({
	open,
	onOpenChange,
	multisigAddress,
}: ProposalSheetProps) {
	const { network } = useNetwork();

	const form = useForm<ProposalFormData>({
		resolver: zodResolver(proposalSchema),
		defaultValues: {
			description: '',
			transactionData: '',
		},
	});

	const dryRunMutation = useDryRun();
	const createProposalMutation = useCreateProposal();

	// Handle successful proposal creation
	const handleCreateSuccess = () => {
		onOpenChange(false);
		form.reset();
		dryRunMutation.reset();
	};

	// Trigger success handler when mutation succeeds
	useEffect(() => {
		if (createProposalMutation.isSuccess) {
			handleCreateSuccess();
			createProposalMutation.reset(); // Reset the mutation state
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [createProposalMutation.isSuccess]);

	// Check if dry run was successful
	const isDryRunSuccessful =
		dryRunMutation.isSuccess &&
		dryRunMutation.data?.effects?.status?.status ===
			'success';

	const onSubmit = (data: ProposalFormData) => {
		if (!isDryRunSuccessful) {
			return;
		}

		createProposalMutation.mutate({
			multisigAddress,
			transactionData: data.transactionData,
			description: data.description,
		});
	};

	const handleClose = (open: boolean) => {
		onOpenChange(open);
		if (!open) {
			form.reset();
			dryRunMutation.reset();
			createProposalMutation.reset();
		}
	};

	const handlePreview = () => {
		const transactionData = form.getValues(
			'transactionData',
		);
		if (transactionData) {
			dryRunMutation.mutate(transactionData);
		}
	};

	// Watch for transaction data changes
	const transactionData = form.watch('transactionData');

	// Reset mutations when transaction data changes (user edits after preview/error)
	const handleTransactionDataChange = () => {
		if (dryRunMutation.data || dryRunMutation.error) {
			dryRunMutation.reset();
		}
		if (createProposalMutation.error) {
			createProposalMutation.reset();
		}
	};

	return (
		<Sheet open={open} onOpenChange={handleClose}>
			<SheetContent className="!w-full sm:!w-[70vw] !max-w-none px-4 sm:px-8 overflow-y-auto">
				<SheetHeader>
					<div className="flex items-center justify-between">
						<div>
							<SheetTitle>Create New Proposal</SheetTitle>
							<SheetDescription>
								Create a new proposal for the multisig to
								vote on.
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

				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="space-y-8 mt-8 pb-8"
				>
					{/* Transaction Data */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<label
								htmlFor="transaction-data"
								className="text-sm font-medium text-gray-700"
							>
								Transaction Data (JSON or base64)
							</label>
							{transactionData && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handlePreview}
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
								onChange: handleTransactionDataChange,
							})}
							rows={dryRunMutation.data ? 6 : 12}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm"
						/>
						{form.formState.errors.transactionData && (
							<p className="text-sm text-red-600">
								{
									form.formState.errors.transactionData
										.message
								}
							</p>
						)}
					</div>

					{/* Preview Results */}
					{(dryRunMutation.data ||
						dryRunMutation.error) && (
						<div
							className={`border rounded-lg p-4 ${
								isDryRunSuccessful
									? 'border-green-200 bg-white'
									: 'border-red-200 bg-white'
							}`}
						>
							<div className="flex items-center gap-2 mb-3">
								{isDryRunSuccessful ? (
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
							{isDryRunSuccessful ? (
								<EffectsPreview
									output={dryRunMutation.data}
									bytes={transactionData}
								/>
							) : (
								<p className="text-sm text-red-600">
									{dryRunMutation.error?.message ||
										'Transaction would fail on-chain'}
								</p>
							)}
						</div>
					)}

					{/* Proposal Creation Error */}
					{createProposalMutation.error && (
						<div className="border border-red-200 bg-white rounded-lg p-4">
							<div className="flex items-center gap-2 mb-3">
								<AlertCircle className="w-5 h-5 text-red-600" />
								<h3 className="font-medium text-gray-900">
									Failed to Create Proposal
								</h3>
							</div>
							<p className="text-sm text-red-600">
								{createProposalMutation.error.message}
							</p>
						</div>
					)}

					{/* Description */}
					<div className="space-y-2">
						<label
							htmlFor="description"
							className="text-sm text-gray-600"
						>
							Description (optional)
						</label>
						<textarea
							id="description"
							placeholder="Optional description for this proposal..."
							{...form.register('description')}
							rows={2}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
						/>
						{form.formState.errors.description && (
							<p className="text-sm text-red-600">
								{form.formState.errors.description.message}
							</p>
						)}
					</div>

					{/* Action Buttons */}
					<div className="flex justify-end space-x-3 pt-4 border-t">
						<Button
							type="button"
							variant="outline"
							onClick={() => handleClose(false)}
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
								className="bg-green-600 hover:bg-green-700"
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
			</SheetContent>
		</Sheet>
	);
}
