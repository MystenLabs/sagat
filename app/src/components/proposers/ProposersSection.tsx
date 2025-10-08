import { Plus, Users } from 'lucide-react';
import { useState } from 'react';
import type { MultisigProposer } from '@mysten/sagat';

import { Button } from '../ui/button';
import { ProposersList } from './ProposersList';
import { AddProposerDialog } from './AddProposerDialog';
import { RemoveProposerDialog } from './RemoveProposerDialog';

interface ProposersSectionProps {
	proposers: Omit<MultisigProposer, 'multisigAddress'>[];
	multisigAddress: string;
	isLoading?: boolean;
	error?: Error | null;
}

export function ProposersSection({
	proposers,
	multisigAddress,
	isLoading = false,
	error = null,
}: ProposersSectionProps) {
	const [showAddProposer, setShowAddProposer] = useState(false);
	const [showRemoveProposer, setShowRemoveProposer] =
		useState(false);
	const [selectedProposer, setSelectedProposer] = useState<
		string | null
	>(null);

	if (isLoading) {
		return (
			<div className="bg-white border rounded-lg p-6">
				<h2 className="text-lg font-semibold mb-4 flex items-center">
					<Users className="w-5 h-5 mr-2" />
					Proposers
				</h2>
				<div className="flex items-center justify-center py-8">
					<div className="text-sm text-gray-500">
						Loading proposers...
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="bg-white border rounded-lg p-6">
				<h2 className="text-lg font-semibold mb-4 flex items-center">
					<Users className="w-5 h-5 mr-2" />
					Proposers
				</h2>
				<div className="text-sm text-gray-500 text-center py-8">
					<p>Failed to load proposers</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="bg-white border rounded-lg p-6">
				<div className="flex items-center justify-between mb-2">
					<h2 className="text-lg font-semibold flex items-center">
						<Users className="w-5 h-5 mr-2" />
						Proposers ({proposers.length})
					</h2>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowAddProposer(true)}
					>
						<Plus className="w-4 h-4 mr-2" />
						Add Proposer
					</Button>
				</div>

				<p className="text-sm text-muted-foreground mb-4">
					External proposers can create proposals for this
					multisig without being signers. They cannot approve or
					execute transactions.
				</p>

				{proposers.length === 0 ? (
					<div className="text-sm text-gray-500 text-center py-8">
						<p>
							No external proposers added yet. Members
							can add proposers who can create proposals
							without being signers.
						</p>
					</div>
				) : (
					<ProposersList
						proposers={proposers}
						onRemoveProposer={(address) => {
							setSelectedProposer(address);
							setShowRemoveProposer(true);
						}}
					/>
				)}
			</div>

			{/* Add Proposer Dialog */}
			<AddProposerDialog
				open={showAddProposer}
				onOpenChange={setShowAddProposer}
				multisigAddress={multisigAddress}
			/>

			{/* Remove Proposer Dialog */}
			<RemoveProposerDialog
				open={showRemoveProposer}
				onOpenChange={setShowRemoveProposer}
				multisigAddress={multisigAddress}
				proposerAddress={selectedProposer}
			/>
		</>
	);
}
