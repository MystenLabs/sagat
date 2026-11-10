// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

import { content } from '@/content';

import { useNetwork } from '../contexts/NetworkContext';
import { useNetworkOption } from '../hooks/useNetworkOptions';
import { Button, disabledButton } from './ui/button';
import { DismissButton } from './ui/dismiss-button';

const COPY = content.network;

/**
 * A strip across the top of the content column while the app points at a
 * test network. It sits in the flow and pushes the page down, on an opaque
 * yellow that reads stronger than the translucent warning tint.
 */
export function TestModeBanner() {
	const { isTestMode, network, setNetwork } = useNetwork();
	const [isDismissed, setIsDismissed] = useState(false);
	const mainnet = useNetworkOption('mainnet');

	if (!isTestMode || isDismissed) {
		return null;
	}

	return (
		<div
			role="region"
			aria-label={COPY.testMode.region}
			className="flex items-center gap-3 border-b border-warning-border bg-warning-solid px-4 py-2.5 text-warning-foreground md:px-6"
			data-testid="test-mode-banner"
		>
			<AlertTriangle className="size-4 shrink-0" />
			{/* On phones the hint wraps under the sentence. */}
			<div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
				<p className="min-w-0 text-13 sm:flex-1">
					<span className="font-medium">
						{COPY.testMode.title}
					</span>{' '}
					{COPY.testMode.connectedTo(network)}{' '}
					<span className="hidden sm:inline">
						{COPY.testMode.noRealFunds}
					</span>
				</p>
				{mainnet.hint && (
					<span className="text-12">{mainnet.hint}</span>
				)}
			</div>
			<Button
				size="sm"
				onClick={() => setNetwork('mainnet')}
				disabled={!mainnet.enabled}
				className={disabledButton}
			>
				{COPY.switchToMainnet}
			</Button>
			<DismissButton
				onClick={() => setIsDismissed(true)}
				className="shrink-0 p-1 hover:bg-warning-foreground/10"
			/>
		</div>
	);
}
