// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { isValidSuiAddress } from '@mysten/sui/utils';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { useAddProposer } from '../../hooks/useAddProposer';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
	Modal,
	ModalActions,
	ModalContent,
	ModalHeader,
} from '../ui/modal';

interface AddProposerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	multisigAddress: string;
}

export function AddProposerDialog({
	open,
	onOpenChange,
	multisigAddress,
}: AddProposerDialogProps) {
	const [proposerAddress, setProposerAddress] =
		useState('');
	const [validationError, setValidationError] = useState<
		string | null
	>(null);

	const addProposer = useAddProposer(multisigAddress, {
		onSuccess: () => {
			setProposerAddress('');
			setValidationError(null);
			onOpenChange(false);
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setValidationError(null);

		if (!proposerAddress.trim()) {
			setValidationError('Please enter a proposer address');
			return;
		}

		if (!isValidSuiAddress(proposerAddress)) {
			setValidationError(
				'Please enter a valid Sui address',
			);
			return;
		}

		addProposer.mutate(proposerAddress);
	};

	const handleClose = () => {
		setProposerAddress('');
		setValidationError(null);
		onOpenChange(false);
	};

	return (
		<Modal open={open} onClose={handleClose} size="lg">
			<ModalHeader
				icon={<Plus className="w-6 h-6 text-blue-500" />}
				title="Add Proposer"
			/>

			<form onSubmit={handleSubmit}>
				<ModalContent>
					<p className="text-sm text-gray-600 mb-4">
						Add an external address that can create
						proposals for this multisig without being a
						signer.
					</p>

					<div className="space-y-2">
						<label
							htmlFor="proposer-address"
							className="text-sm font-medium"
						>
							Proposer Address
						</label>
						<Input
							id="proposer-address"
							placeholder="0x..."
							value={proposerAddress}
							onChange={(e) =>
								setProposerAddress(e.target.value)
							}
							disabled={addProposer.isPending}
						/>
						{validationError && (
							<p className="text-sm text-red-500">
								{validationError}
							</p>
						)}
					</div>
				</ModalContent>

				<ModalActions>
					<Button
						type="button"
						variant="outline"
						onClick={handleClose}
						disabled={addProposer.isPending}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						disabled={addProposer.isPending}
					>
						{addProposer.isPending
							? 'Adding...'
							: 'Add Proposer'}
					</Button>
				</ModalActions>
			</form>
		</Modal>
	);
}
