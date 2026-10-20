// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

import { useNetwork } from '../contexts/NetworkContext';
import { useNetworkOptions } from '../hooks/useNetworkOptions';

export function TestModeBanner() {
	const { isTestMode, network, setNetwork } = useNetwork();
	const [isDismissed, setIsDismissed] = useState(false);
	const mainnet = useNetworkOptions().find(
		(option) => option.value === 'mainnet',
	);
	const mainnetHint = mainnet
		? mainnet.hint
		: 'Not available';

	if (!isTestMode || isDismissed) {
		return null;
	}

	const handleDismiss = () => {
		setIsDismissed(true);
	};

	return (
		<div
			className="sticky bottom-0 z-40 mt-auto bg-background"
			data-testid="test-mode-banner"
		>
			<div className="border-t-2 border-warning-border bg-warning px-4 py-3">
				<div className="flex items-center justify-between max-w-7xl mx-auto">
					<div className="flex items-center gap-3">
						<AlertTriangle className="w-5 h-5 text-warning-foreground" />
						<div>
							<p className="text-sm font-medium text-warning-foreground">
								Test Mode Active
							</p>
							<p className="text-xs text-warning-foreground">
								You're connected to {network}. No real funds
								will be used.
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						{mainnetHint && (
							<span className="text-12 text-warning-foreground">
								{mainnetHint}
							</span>
						)}
						<button
							onClick={() => setNetwork('mainnet')}
							disabled={!mainnet?.enabled}
							className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50"
						>
							Switch to Mainnet
						</button>
						<button
							onClick={handleDismiss}
							className="p-1 hover:bg-warning rounded transition-colors cursor-pointer"
							title="Dismiss"
						>
							<X className="w-4 h-4 text-warning-foreground" />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
