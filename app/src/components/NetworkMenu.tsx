// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useNetwork } from '@/contexts/NetworkContext';
import {
	useNetworkOptions,
	type NetworkScope,
} from '@/hooks/useNetworkOptions';
import { cn } from '@/lib/utils';

/** Green on mainnet, amber on any test network. */
export function NetworkStatusDot({
	className,
}: {
	className?: string;
}) {
	const { isTestMode } = useNetwork();
	return (
		<span
			className={cn(
				'size-2 shrink-0 rounded-full',
				isTestMode
					? 'bg-warning-foreground'
					: 'bg-success-foreground',
				className,
			)}
		/>
	);
}

/**
 * The body of every network menu: one item per network the scope can
 * offer, switching the wallet kit's network. Wrap it in a DropdownMenu
 * with the trigger of your choice.
 */
export function NetworkMenuItems({
	scope = 'app',
}: {
	scope?: NetworkScope;
}) {
	const { network, setNetwork } = useNetwork();
	const options = useNetworkOptions(scope);

	return (
		<DropdownMenuGroup>
			<DropdownMenuLabel>Network</DropdownMenuLabel>
			{options.map(({ value, enabled, hint }) => (
				<DropdownMenuItem
					key={value}
					disabled={!enabled}
					className={cn(
						'capitalize',
						value === network && 'bg-accent',
					)}
					onClick={() => setNetwork(value)}
				>
					{value}
					{hint && (
						<span className="ml-auto text-11 normal-case text-muted-foreground">
							{hint}
						</span>
					)}
				</DropdownMenuItem>
			))}
		</DropdownMenuGroup>
	);
}
