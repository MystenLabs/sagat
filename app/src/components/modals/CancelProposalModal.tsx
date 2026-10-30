// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useRef } from 'react';

import { content } from '@/content';

import { Button } from '../ui/button';
import {
	Modal,
	ModalActions,
	ModalContent,
	ModalHeader,
} from '../ui/modal';

const COPY = content.proposal.cancel;

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
			<ModalHeader title={COPY.title} />
			<ModalContent>
				{variant === 'alone' ? (
					<p>
						{COPY.alone(title)}
						{ready && COPY.aloneReady}
					</p>
				) : (
					<p>
						{COPY.others(title)}
						{ready && COPY.othersReady}
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
					{content.proposal.shared.goBack}
				</Button>
				<Button
					variant="destructive"
					onClick={onConfirm}
					disabled={isLoading}
					data-testid="confirm-cancel-proposal-button"
				>
					{isLoading
						? COPY.cancelling
						: content.proposal.shared.cancelProposal}
				</Button>
			</ModalActions>
		</Modal>
	);
}
