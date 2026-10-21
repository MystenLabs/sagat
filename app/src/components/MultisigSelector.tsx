// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import {
	AlertTriangle,
	ChevronDown,
	Search,
	Users,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { Label } from '@/components/ui/label';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import {
	primarySignerSet,
	validSignerSets,
} from '@/lib/signerSets';
import { type AccountForPublicKey } from '@/lib/types';

// The subtitle shows one signer set, the primary one; an account with
// several valid sets says how many, and the overview lists them.
function moreSets(account: AccountForPublicKey) {
	const count = validSignerSets(account).length;
	return count > 1 ? ` • ${count} signer sets` : '';
}

// The dropdown row's text after the address.
function summarise(account: AccountForPublicKey) {
	const signerSet = primarySignerSet(account);
	const threshold = signerSet
		? ` • ${signerSet.threshold} out of ${signerSet.totalWeight} weight threshold`
		: '';
	return `${threshold}${moreSets(account)}`;
}

interface MultisigSelectorProps {
	multisigs: AccountForPublicKey[];
	selectedMultisig: string;
	onSelectMultisig: (address: string) => void;
}

export function MultisigSelector({
	multisigs,
	selectedMultisig,
	onSelectMultisig,
}: MultisigSelectorProps) {
	const [showDropdown, setShowDropdown] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Filter multisigs based on search query
	const filteredMultisigs = useMemo(
		() =>
			multisigs.filter(
				(m) =>
					(m.name?.toLowerCase() || '').includes(
						searchQuery.toLowerCase(),
					) ||
					m.address
						.toLowerCase()
						.includes(searchQuery.toLowerCase()),
			),
		[multisigs, searchQuery],
	);

	const currentMultisig = multisigs.find(
		(m) => m.address === selectedMultisig,
	);
	const currentSet =
		currentMultisig && primarySignerSet(currentMultisig);

	useOnClickOutside(dropdownRef, () => {
		setShowDropdown(false);
		setSearchQuery('');
	});

	if (!currentMultisig) return null;

	if (multisigs.length === 1) {
		// Single multisig - no dropdown needed
		return (
			<div className="flex items-center space-x-4">
				<div className="flex items-center">
					<div className="w-10 h-10 bg-info-soft rounded-full flex items-center justify-center mr-3">
						<Users className="w-5 h-5 text-info-foreground" />
					</div>
					<div>
						<h2 className="font-semibold">
							{currentMultisig?.name ||
								formatAddress(currentMultisig?.address)}
						</h2>
						<p className="text-sm text-muted-foreground">
							{currentSet &&
								`${currentSet.threshold}/${currentSet.members.length} threshold • `}
							{formatAddress(
								currentMultisig?.address || '',
							)}
							{moreSets(currentMultisig)}
						</p>
					</div>
				</div>
			</div>
		);
	}

	// Multiple multisigs - show dropdown
	return (
		<div className="relative flex-1" ref={dropdownRef}>
			<button
				onClick={() => setShowDropdown(!showDropdown)}
				className="flex items-center cursor-pointer justify-between w-full max-w-lg px-4 py-2 text-left bg-surface border rounded-lg hover:bg-accent transition-colors"
			>
				<div className="flex items-center">
					<div className="w-8 h-8 bg-info-soft rounded-full flex items-center justify-center mr-3">
						<Users className="w-4 h-4 text-info-foreground" />
					</div>
					<div>
						<div className="font-medium">
							{currentMultisig?.name ||
								formatAddress(currentMultisig.address)}
							{currentMultisig.pendingMembers ? (
								<Label
									variant="warning"
									size="sm"
									className="ml-2"
								>
									{currentMultisig.pendingMembers} pending
									member
									{currentMultisig.pendingMembers > 1
										? 's'
										: ''}
								</Label>
							) : null}
							{currentMultisig.rejectedMembers > 0 ? (
								<Label
									variant="error"
									size="sm"
									className="ml-2"
								>
									{currentMultisig.rejectedMembers} rejected
									member
									{currentMultisig.rejectedMembers > 1
										? 's'
										: ''}
								</Label>
							) : null}
						</div>
						<p className="text-xs text-muted-foreground">
							{currentSet &&
								`${currentSet.threshold} threshold • ${currentSet.members.length} members • `}
							{formatAddress(
								currentMultisig?.address || '',
							)}
							{moreSets(currentMultisig)}
						</p>
					</div>
				</div>
				<ChevronDown
					className={`w-4 h-4 text-muted-foreground transition-transform ${showDropdown ? 'rotate-180' : ''}`}
				/>
			</button>

			{/* Dropdown Menu */}
			{showDropdown && (
				<div className="absolute top-full mt-2 w-full max-w-lg bg-popover border rounded-lg shadow-lg z-10">
					<div className="p-2">
						{/* Search Input */}
						<div className="relative mb-2">
							<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
							<input
								type="text"
								placeholder="Search by name or address..."
								value={searchQuery}
								onChange={(e) =>
									setSearchQuery(e.target.value)
								}
								className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
							/>
						</div>

						<p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase">
							{filteredMultisigs.length === multisigs.length
								? 'Select Multisig'
								: `${filteredMultisigs.length} of ${multisigs.length} multisigs`}
						</p>

						{filteredMultisigs.length === 0 ? (
							<div className="px-3 py-4 text-center text-sm text-muted-foreground">
								No multisigs found matching "{searchQuery}"
							</div>
						) : (
							filteredMultisigs.map((multisig) => (
								<button
									key={multisig.address}
									onClick={() => {
										onSelectMultisig(multisig.address);
										setShowDropdown(false);
										setSearchQuery(''); // Clear search when selecting
									}}
									className={`w-full px-3 cursor-pointer py-2 text-left rounded-md hover:bg-accent transition-colors ${
										multisig.address === selectedMultisig
											? 'bg-info-soft'
											: ''
									}`}
								>
									<div className="flex items-center justify-between">
										<div className="flex items-center">
											<div className="w-8 h-8 bg-info-soft rounded-full flex items-center justify-center mr-3">
												<Users className="w-4 h-4 text-info-foreground" />
											</div>
											<div>
												<div className="font-medium">
													{multisig.name ||
														formatAddress(multisig.address)}
												</div>
												<p className="text-xs text-muted-foreground">
													{formatAddress(multisig.address)}
													{summarise(multisig)}
												</p>
											</div>
										</div>
										{multisig.pendingMembers > 0 && (
											<Label variant="warning">
												<AlertTriangle className="w-4 h-4" />
											</Label>
										)}
										{multisig.rejectedMembers > 0 && (
											<Label variant="error">
												<AlertTriangle className="w-4 h-4" />
											</Label>
										)}
									</div>
								</button>
							))
						)}
					</div>
				</div>
			)}
		</div>
	);
}
