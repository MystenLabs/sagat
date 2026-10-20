// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChevronDown } from 'lucide-react';

import {
	NetworkMenuItems,
	NetworkStatusDot,
} from '@/components/NetworkMenu';
import { buttonVariants } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNetwork } from '@/contexts/NetworkContext';

/**
 * Picks the network a tool talks to. It is the wallet kit's network, the
 * same one the sidebar shows, but the tools work straight against the
 * chain, so they also get devnet.
 */
export function NetworkSelector() {
	const { network } = useNetwork();

	return (
		<DropdownMenu>
			{/* A plain button: Base UI anchors the menu to the trigger's ref. */}
			<DropdownMenuTrigger
				data-testid="tool-network-button"
				aria-label={`Network: ${network}`}
				data-network={network}
				className={buttonVariants({
					variant: 'outline',
					size: 'sm',
				})}
			>
				<NetworkStatusDot />
				<span className="capitalize">{network}</span>
				<ChevronDown className="size-4 opacity-60" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-40">
				<NetworkMenuItems scope="tools" />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
