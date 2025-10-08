import { AlertTriangle } from 'lucide-react';

import { Button } from '../ui/button';
import {
	Modal,
	ModalActions,
	ModalContent,
	ModalHeader,
	ModalWarning,
} from '../ui/modal';
import { useRemoveProposer } from '../../hooks/useRemoveProposer';

interface RemoveProposerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	multisigAddress: string;
	proposerAddress: string | null;
}

export function RemoveProposerDialog({
	open,
	onOpenChange,
	multisigAddress,
	proposerAddress,
}: RemoveProposerDialogProps) {
	const removeProposer = useRemoveProposer(multisigAddress, {
		onSuccess: () => {
			onOpenChange(false);
		},
	});

	const handleRemove = () => {
		if (!proposerAddress) return;
		removeProposer.mutate(proposerAddress);
	};

	return (
		<Modal open={open} onClose={() => onOpenChange(false)}>
			<ModalHeader
				icon={
					<AlertTriangle className="w-6 h-6 text-amber-500" />
				}
				title="Remove Proposer"
			/>

			<ModalContent>
				<p className="text-gray-700">
					Are you sure you want to remove this proposer?
				</p>

				{proposerAddress && (
					<div className="p-3 bg-gray-50 rounded-lg border">
						<code className="text-sm font-mono text-gray-900 break-all">
							{proposerAddress}
						</code>
					</div>
				)}

				<ModalWarning>
					All pending proposals from this proposer will be
					cancelled when they are removed.
				</ModalWarning>
			</ModalContent>

			<ModalActions>
				<Button
					type="button"
					variant="outline"
					onClick={() => onOpenChange(false)}
					disabled={removeProposer.isPending}
				>
					Cancel
				</Button>
				<Button
					type="button"
					onClick={handleRemove}
					disabled={removeProposer.isPending}
					className="bg-red-600 hover:bg-red-700"
				>
					{removeProposer.isPending
						? 'Removing...'
						: 'Remove Proposer'}
				</Button>
			</ModalActions>
		</Modal>
	);
}
