// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { AlertTriangle } from 'lucide-react';

import { content } from '@/content';
import { useNetwork } from '@/contexts/NetworkContext';

import { Button } from './ui/button';

export function DevnetNotSupported() {
	// setNetwork also saves the choice, so a reload does not land on devnet.
	const { setNetwork } = useNetwork();

	return (
		<div className="mx-auto mt-20 p-8">
			<div className="text-center">
				<div className="inline-flex items-center justify-center w-20 h-20 bg-warning-soft rounded-full mb-6">
					<AlertTriangle className="w-10 h-10 text-warning-foreground" />
				</div>

				<h1
					className="text-3xl font-bold mb-3"
					data-testid="devnet-not-supported"
				>
					{content.network.devnet.title}
				</h1>

				<p className="text-muted-foreground mb-8">
					{content.network.devnet.body}
					<br />
					{content.network.devnet.hint}
				</p>

				<div className="flex gap-3 justify-center">
					<Button
						size="lg"
						onClick={() => setNetwork('mainnet')}
						data-testid="switch-to-mainnet-button"
					>
						{content.network.switchToMainnet}
					</Button>
					<Button
						size="lg"
						variant="outline"
						onClick={() => setNetwork('testnet')}
						data-testid="switch-to-testnet-button"
					>
						{content.network.switchToTestnet}
					</Button>
				</div>
			</div>
		</div>
	);
}
