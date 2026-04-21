// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

export type LocalNetwork = 'mainnet' | 'testnet' | 'devnet';

const networks: { value: LocalNetwork; label: string }[] = [
	{ value: 'mainnet', label: 'Mainnet' },
	{ value: 'testnet', label: 'Testnet' },
	{ value: 'devnet', label: 'Devnet' },
];

export function NetworkSelector() {
	const dappKit = useDAppKit();
	const network = useCurrentNetwork() as LocalNetwork;

	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useOnClickOutside(
		dropdownRef,
		() => setIsOpen(false),
		isOpen,
	);

	const handleNetworkChange = (
		newNetwork: LocalNetwork,
	) => {
		dappKit.switchNetwork(newNetwork);
		setIsOpen(false);
	};

	return (
		<div className="relative" ref={dropdownRef}>
			<Button
				variant="outline"
				size="sm"
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-2"
			>
				<span className="capitalize">{network}</span>
				<ChevronDown className="w-4 h-4" />
			</Button>

			{isOpen && (
				<div className="absolute right-0 mt-2 w-40 bg-popover border border-border rounded-lg shadow-lg z-50">
					{networks.map((net) => (
						<button
							key={net.value}
							onClick={() => handleNetworkChange(net.value)}
							className={`w-full text-left px-4 py-2 text-sm hover:bg-accent first:rounded-t-lg last:rounded-b-lg cursor-pointer ${
								network === net.value
									? 'bg-info-soft text-info-foreground font-medium'
									: 'text-muted-foreground'
							}`}
						>
							{net.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
