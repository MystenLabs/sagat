// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChevronDown } from 'lucide-react';

import {
	NetworkMenuItems,
	NetworkStatusDot,
} from '@/components/NetworkMenu';
import { Button } from '@/components/ui/button';
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
			<DropdownMenuTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						data-testid="tool-network-button"
					/>
				}
			>
				<NetworkStatusDot />
				<span className="capitalize">{network}</span>
				<ChevronDown className="size-3 opacity-60" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-40">
				<NetworkMenuItems scope="tools" />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
