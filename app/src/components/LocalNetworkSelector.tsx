// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type LocalNetwork = 'mainnet' | 'testnet' | 'devnet';

const networks: { value: LocalNetwork; label: string }[] = [
	{ value: 'mainnet', label: 'Mainnet' },
	{ value: 'testnet', label: 'Testnet' },
	{ value: 'devnet', label: 'Devnet' },
];

/** Picks the network a tool talks to; the choice is the wallet kit's. */
export function NetworkSelector() {
	const dappKit = useDAppKit();
	const network = useCurrentNetwork() as LocalNetwork;
	const isTestMode = network !== 'mainnet';

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						data-testid="tool-network-button"
					/>
				}
			>
				<span
					className={cn(
						'size-2 rounded-full',
						isTestMode
							? 'bg-warning-foreground'
							: 'bg-success-foreground',
					)}
				/>
				<span className="capitalize">{network}</span>
				<ChevronDown className="size-3 opacity-60" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-40">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Network</DropdownMenuLabel>
					{networks.map((net) => (
						<DropdownMenuItem
							key={net.value}
							className={cn(
								net.value === network && 'bg-accent',
							)}
							onClick={() =>
								dappKit.switchNetwork(net.value)
							}
						>
							{net.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
