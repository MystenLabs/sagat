// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { AlertTriangle } from 'lucide-react';

import { Button } from './ui/button';

export function DevnetNotSupported() {
	const dappKit = useDAppKit();

	return (
		<div className="mx-auto mt-20 p-8">
			<div className="text-center">
				<div className="inline-flex items-center justify-center w-20 h-20 bg-warning-soft rounded-full mb-6">
					<AlertTriangle className="w-10 h-10 text-warning-foreground" />
				</div>

				<h1 className="text-3xl font-bold mb-3">
					Devnet Not Supported
				</h1>

				<p className="text-muted-foreground mb-8">
					The main Sagat app does not support devnet.
					<br />
					Switch to a supported network to continue.
				</p>

				<div className="flex gap-3 justify-center">
					<Button
						size="lg"
						onClick={() => dappKit.switchNetwork('mainnet')}
					>
						Switch to Mainnet
					</Button>
					<Button
						size="lg"
						variant="outline"
						onClick={() => dappKit.switchNetwork('testnet')}
					>
						Switch to Testnet
					</Button>
				</div>
			</div>
		</div>
	);
}
