import type { MultisigProposer } from '@mysten/sagat';
import { Plus, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from '../ui/button';
import { AddProposerDialog } from './AddProposerDialog';
import { ProposersList } from './ProposersList';
import { RemoveProposerDialog } from './RemoveProposerDialog';

interface ProposersSectionProps {
	proposers: Omit<MultisigProposer, 'multisigAddress'>[];
	multisigAddress: string;
	isLoading?: boolean;
	error?: Error | null;
}

interface ContainerProps {
	count?: number;
	isLoading?: boolean;
	error?: boolean;
	onAddProposer: () => void;
	children: ReactNode;
}

function Container({
	count,
	isLoading = false,
	error = false,
	onAddProposer,
	children,
}: ContainerProps) {
	const showCount =
		!isLoading && !error && count !== undefined;
	const showActions = !isLoading && !error;

	return (
		<div className="bg-white border rounded-lg p-6">
			<div className="flex items-center justify-between mb-2">
				<h2 className="text-lg font-semibold flex items-center">
					<Users className="w-5 h-5 mr-2" />
					Proposers{showCount && ` (${count})`}
				</h2>
				{showActions && (
					<Button
						variant="outline"
						size="sm"
						onClick={onAddProposer}
					>
						<Plus className="w-4 h-4 mr-2" />
						Add Proposer
					</Button>
				)}
			</div>

			{showActions && (
				<p className="text-sm text-gray-600 mb-4">
					External proposers can create proposals for this
					multisig without being signers. They cannot
					approve or execute transactions.
				</p>
			)}

			{children}
		</div>
	);
}

export function ProposersSection({
	proposers,
	multisigAddress,
	isLoading = false,
	error = null,
}: ProposersSectionProps) {
	const [showAddProposer, setShowAddProposer] =
		useState(false);
	const [showRemoveProposer, setShowRemoveProposer] =
		useState(false);
	const [selectedProposer, setSelectedProposer] = useState<
		string | null
	>(null);

	return (
		<>
			<Container
				count={proposers.length}
				isLoading={isLoading}
				error={!!error}
				onAddProposer={() => setShowAddProposer(true)}
			>
				{isLoading ? (
					<div className="flex items-center justify-center py-8">
						<div className="text-sm text-gray-500">
							Loading proposers...
						</div>
					</div>
				) : error ? (
					<div className="text-sm text-gray-500 text-center py-8">
						<p>Failed to load proposers</p>
					</div>
				) : proposers.length === 0 ? (
					<div className="text-sm text-gray-500 text-center py-8">
						<p>
							No external proposers added yet. Members can
							add proposers who can create proposals without
							being signers.
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
			</Container>

			<AddProposerDialog
				open={showAddProposer}
				onOpenChange={setShowAddProposer}
				multisigAddress={multisigAddress}
			/>

			<RemoveProposerDialog
				open={showRemoveProposer}
				onOpenChange={setShowRemoveProposer}
				multisigAddress={multisigAddress}
				proposerAddress={selectedProposer}
			/>
		</>
	);
}
