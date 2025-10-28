// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { AlertTriangle } from 'lucide-react';

import { Button } from '../ui/button';
import {
	Modal,
	ModalActions,
	ModalContent,
	ModalHeader,
	ModalWarning,
} from '../ui/modal';

interface CancelProposalModalProps {
	open: boolean;
	onClose: () => void;
	onConfirm: () => void;
	isLoading: boolean;
	proposalId: number;
}

export function CancelProposalModal({
	open,
	onClose,
	onConfirm,
	isLoading,
	proposalId,
}: CancelProposalModalProps) {
	return (
		<Modal open={open} onClose={onClose}>
			<ModalHeader
				icon={
					<AlertTriangle className="w-6 h-6 text-amber-500" />
				}
				title="Cancel Proposal"
			/>

			<ModalContent>
				<p className="text-gray-700">
					Are you sure you want to cancel proposal #
					{proposalId}?
				</p>

				<ModalWarning>
					<strong>Important:</strong> Cancelling this
					proposal will mark it as cancelled in the system.
					However, if enough signatures have been collected
					offline, the transaction could still be executed
					directly on-chain by anyone with the signatures.
				</ModalWarning>
			</ModalContent>

			<ModalActions>
				<Button
					variant="outline"
					onClick={onClose}
					disabled={isLoading}
				>
					Keep Proposal
				</Button>
				<Button
					onClick={onConfirm}
					disabled={isLoading}
					className="bg-red-600 hover:bg-red-700"
				>
					{isLoading ? 'Cancelling...' : 'Cancel Proposal'}
				</Button>
			</ModalActions>
		</Modal>
	);
}
