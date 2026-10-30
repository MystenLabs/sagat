// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useRef } from 'react';

import { Button } from '../ui/button';
import {
	Modal,
	ModalActions,
	ModalContent,
	ModalHeader,
} from '../ui/modal';

interface CancelProposalModalProps {
	open: boolean;
	onClose: () => void;
	onConfirm: () => void;
	isLoading: boolean;
	/** The proposal's title, quoted in the body. */
	title: string;
	/** `alone` when nobody but the viewer signed it. */
	variant: 'alone' | 'others';
	/** The signatures reached the threshold. */
	ready: boolean;
}

/**
 * Asks before cancelling a proposal. It can't close while the wallet is
 * asked to sign the cancellation.
 */
export function CancelProposalModal({
	open,
	onClose,
	onConfirm,
	isLoading,
	title,
	variant,
	ready,
}: CancelProposalModalProps) {
	const backRef = useRef<HTMLButtonElement>(null);
	return (
		<Modal
			open={open}
			onClose={() => {
				if (!isLoading) onClose();
			}}
			className="sm:max-w-105"
			initialFocus={backRef}
			data-testid="cancel-proposal-dialog"
			data-variant={variant}
		>
			<ModalHeader title="Cancel this proposal?" />
			<ModalContent>
				{variant === 'alone' ? (
					<p>
						Nobody else has signed “{title}” yet. It moves
						to the Cancelled tab, and no one can sign or
						execute it in the app after this.
						{ready &&
							' Your signature already meets the threshold and stays valid on chain, so anyone holding it can still execute the transaction.'}
					</p>
				) : (
					<p>
						“{title}” ends for every signer and moves to the
						Cancelled tab. No one can sign or execute it in
						the app after this.
						{ready &&
							' The signatures already collected stay valid on chain.'}
					</p>
				)}
			</ModalContent>
			<ModalActions>
				<Button
					ref={backRef}
					variant="outline"
					onClick={onClose}
					disabled={isLoading}
				>
					Go back
				</Button>
				<Button
					variant="destructive"
					onClick={onConfirm}
					disabled={isLoading}
					data-testid="confirm-cancel-proposal-button"
				>
					{isLoading ? 'Cancelling…' : 'Cancel proposal'}
				</Button>
			</ModalActions>
		</Modal>
	);
}
