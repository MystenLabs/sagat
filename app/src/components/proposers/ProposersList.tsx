import type { MultisigProposer } from '@mysten/sagat';

import { CopyButton } from '../ui/CopyButton';
import { Button } from '../ui/button';

interface ProposersListProps {
	proposers: Omit<MultisigProposer, 'multisigAddress'>[];
	onRemoveProposer: (address: string) => void;
}

export function ProposersList({
	proposers,
	onRemoveProposer,
}: ProposersListProps) {
	return (
		<div className="space-y-3">
			{proposers.map((proposer) => (
				<div
					key={proposer.address}
					className="flex items-center justify-between p-3 bg-white rounded border"
				>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-1">
							<code className="text-sm font-mono text-gray-900 truncate">
								{proposer.address.slice(0, 8)}...
								{proposer.address.slice(-6)}
							</code>
							<CopyButton
								value={proposer.address}
								size="xs"
							/>
						</div>
						<div className="text-xs text-gray-500">
							Added by {proposer.addedBy.slice(0, 8)}...
							{proposer.addedBy.slice(-6)} on{' '}
							{new Date(
								proposer.addedAt,
							).toLocaleDateString()}
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							onRemoveProposer(proposer.address)
						}
						className="ml-2"
					>
						Remove
					</Button>
				</div>
			))}
		</div>
	);
}
